import { Instruction, Method, Op, Subroutine } from "./class.ts";
import { Token, TokenType } from "./lexer.ts";
import {
  Binary,
  Block,
  Expression,
  IfStatement,
  LiteralBoolean,
  LiteralString,
  LogStatement,
  MemberAccess,
  New,
  Not,
  Statement,
  VarDeclaration,
  Variable,
} from "./parser.ts";

type Local = {
  variable: Variable;
  register?: number;
  //assigned: boolean;
};

export class Compiler {
  #size = 0;
  #secondHandRegisters: number[] = [];
  // add something to track available variables at every point
  #subroutines: Subroutine[] = [{ instructions: [], next: [Op.Return] }];
  #written: Set<Local>[] = [new Set()];
  #currentSubroutine = 0;
  #locals: Local[] = [];
  constructor(
    readonly script: Statement[],
  ) {}

  #emit(...instructions: Instruction[]) {
    this.#subroutines[this.#currentSubroutine].instructions.push(
      ...instructions,
    );
  }

  #error(token: Token, msg: string) {
    return new Error(
      `Compile error at [${token.line},${token.column}]: ${msg}`,
    );
  }

  #allocate(): number {
    if (this.#secondHandRegisters.length > 0) {
      return this.#secondHandRegisters.pop() as number;
    }
    return this.#size++;
  }

  #deallocate(...register: number[]) {
    this.#secondHandRegisters.push(...register);
  }

  #local(name: string): Local | null {
    for (let i = this.#locals.length - 1; i >= 0; i--) {
      if (this.#locals[i].variable.name === name) {
        return this.#locals[i];
      }
    }
    return null;
  }

  #resolve(variable: Variable): Local {
    const local = this.#local(variable.name);
    if (local === null) {
      throw this.#error(
        variable.token,
        `Undeclared variable '${variable.name}'`,
      );
    }
    return local;
  }

  #hasAssigned(local: Local) {
    return this.#written[this.#currentSubroutine].has(local);
  }

  #getRegister(variable: Variable): number {
    const local = this.#resolve(variable);
    if (local.register === undefined || !this.#hasAssigned(local)) {
      throw this.#error(
        variable.token,
        `Variable '${variable.name}' read before written`,
      );
    }
    return local.register;
  }

  #booleanBinary(
    expression: Binary,
    onFalse: number,
    negate = false,
  ) {
    switch (expression.token.type) {
      case TokenType.AND: {
        if (!negate) {
          this.#boolean(expression.left, onFalse, negate);
          this.#boolean(expression.right, onFalse, negate);
        } else {
          const rightBranch = this.#subroutines.length;
          const continuation = this.#subroutines.length + 1;
          this.#subroutines[rightBranch] = {
            instructions: [],
            next: [Op.Jump, continuation],
          };
          this.#subroutines[continuation] = {
            instructions: [],
            next: this.#subroutines[this.#currentSubroutine].next,
          };
          this.#subroutines[this.#currentSubroutine].next = [
            Op.Jump,
            continuation,
          ];
          this.#boolean(expression.left, rightBranch, negate);
          this.#written[rightBranch] = new Set(
            this.#written[this.#currentSubroutine],
          );
          this.#written[continuation] = new Set(
            this.#written[this.#currentSubroutine],
          );
          this.#currentSubroutine = rightBranch;
          this.#boolean(expression.right, onFalse, negate);
          this.#currentSubroutine = continuation;
          return;
        }
        return;
      }
      case TokenType.IS_NOT: {
        const reg1 = this.#allocate();
        this.#expression(expression.left, reg1);
        const reg2 = this.#allocate();
        this.#expression(expression.right, reg2);
        this.#emit([
          negate ? Op.JumpIfDifferent : Op.JumpIfEqual,
          reg1,
          reg2,
          onFalse,
        ]);
        this.#deallocate(reg1, reg2);
        return;
      }
      case TokenType.IS: {
        const reg1 = this.#allocate();
        this.#expression(expression.left, reg1);
        const reg2 = this.#allocate();
        this.#expression(expression.right, reg2);
        this.#emit([
          negate ? Op.JumpIfEqual : Op.JumpIfDifferent,
          reg1,
          reg2,
          onFalse,
        ]);
        this.#deallocate(reg1, reg2);
        return;
      }
      case TokenType.LESS: {
        const reg1 = this.#allocate();
        this.#expression(expression.left, reg1);
        const reg2 = this.#allocate();
        this.#expression(expression.right, reg2);
        this.#emit(
          negate // note: changed register ordering!
            ? [Op.JumpIfLess, reg1, reg2, onFalse]
            : [Op.JumpIfNotMore, reg2, reg1, onFalse],
        );
        this.#deallocate(reg1, reg2);
        return;
      }
      case TokenType.MORE: {
        const reg1 = this.#allocate();
        this.#expression(expression.left, reg1);
        const reg2 = this.#allocate();
        this.#expression(expression.right, reg2);
        this.#emit(
          negate // note: changed register ordering!
            ? [Op.JumpIfLess, reg2, reg1, onFalse]
            : [Op.JumpIfNotMore, reg1, reg2, onFalse],
        );
        this.#deallocate(reg1, reg2);
        return;
      }
      case TokenType.NOT_LESS: {
        const reg1 = this.#allocate();
        this.#expression(expression.left, reg1);
        const reg2 = this.#allocate();
        this.#expression(expression.right, reg2);
        this.#emit(
          negate // note: changed register ordering!
            ? [Op.JumpIfNotMore, reg2, reg1, onFalse]
            : [Op.JumpIfLess, reg1, reg2, onFalse],
        );
        this.#deallocate(reg1, reg2);
        return;
      }
      case TokenType.NOT_MORE: {
        const reg1 = this.#allocate();
        this.#expression(expression.left, reg1);
        const reg2 = this.#allocate();
        this.#expression(expression.right, reg2);
        this.#emit(
          negate // note: changed register ordering!
            ? [Op.JumpIfNotMore, reg1, reg2, onFalse]
            : [Op.JumpIfLess, reg2, reg1, onFalse],
        );
        this.#deallocate(reg1, reg2);
        return;
      }
      case TokenType.OR:
        {
          if (negate) {
            this.#boolean(expression.left, onFalse, negate);
            this.#boolean(expression.right, onFalse, negate);
          } else {
            const rightBranch = this.#subroutines.length;
            const continuation = this.#subroutines.length + 1;
            this.#subroutines[rightBranch] = {
              instructions: [],
              next: [Op.Jump, continuation],
            };
            this.#subroutines[continuation] = {
              instructions: [],
              next: this.#subroutines[this.#currentSubroutine].next,
            };
            this.#subroutines[this.#currentSubroutine].next = [
              Op.Jump,
              continuation,
            ];
            this.#boolean(expression.left, rightBranch, negate);
            this.#written[rightBranch] = new Set(
              this.#written[this.#currentSubroutine],
            );
            this.#written[continuation] = new Set(
              this.#written[this.#currentSubroutine],
            );
            this.#currentSubroutine = rightBranch;
            this.#boolean(expression.right, onFalse, negate);
            this.#currentSubroutine = continuation;
            return;
          }
        }
        return;
      // later perhaps
      case TokenType.BE: //when everthing is an expression, but then we must take care of partial assignments everywhere as well
      {
        const reg = this.#allocate();
        this.#assignment(expression, reg);
        this.#emit([Op.JumpIfFalse, reg, onFalse]);
        this.#deallocate(reg);
        return;
      }
      // case TokenType.SEMICOLON:
      // case TokenType.VAR:
      default:
        throw this.#error(expression.token, "Malformed boolean expression");
    }
  }

  #boolean(
    expression: Expression,
    onFalse: number,
    negate = false,
  ) {
    switch (expression.constructor) {
      case MemberAccess: {
        const reg = this.#allocate();
        this.#expression(expression, reg);
        this.#emit([
          negate ? Op.JumpIfTrue : Op.JumpIfFalse,
          reg,
          onFalse,
        ]);
        this.#deallocate(reg);
        return;
      }
      case Binary:
        this.#booleanBinary(expression as Binary, onFalse, negate);
        return;
      case LiteralBoolean: {
        if ((expression as LiteralBoolean).value !== negate) {
          return;
        }
        // todo: somehow avoid adding anything to the subroutine beyond this unconditional jump
        this.#emit([Op.Jump, onFalse]);
        return;
      }
      case Not:
        this.#boolean(
          (expression as Not).expression,
          onFalse,
          ((expression as Not).count & 1) === 1 ? !negate : negate,
        );
        return;
      case Variable: {
        const reg = this.#getRegister(expression as Variable);
        this.#emit([
          negate ? Op.JumpIfTrue : Op.JumpIfFalse,
          reg,
          onFalse,
        ]);
        this.#deallocate(reg);
        return;
      }
      default:
        throw this.#error(expression.token, "Expected boolean");
    }
  }

  #assignment(assignment: Binary, target?: number) {
    if (assignment.left instanceof Variable) {
      const local = this.#resolve(assignment.left);
      // local.register could already hav a value and target could be temporary, so...
      // ownership shows up already!
      local.register ||= this.#allocate();
      this.#written[this.#currentSubroutine].add(
        local,
      );
      this.#expression(assignment.right, local.register);
      if (target !== undefined) {
        this.#emit([
          Op.Move,
          target,
          local.register,
        ]);
      }
      return;
    }

    if (assignment.left instanceof MemberAccess) {
      // calculate results, store in register 1
      const register1 = this.#allocate();
      this.#expression(assignment.left.object, register1);
      // now calculate the right hand side and store in register 2
      const register2 = target ?? this.#allocate();
      this.#expression(assignment.right, register2);
      // move the result to the heap
      this.#emit([
        Op.SetField,
        register1,
        assignment.left.field,
        register2,
      ]);
      this.#deallocate(register1);
      if (target === undefined) this.#deallocate(register2);
      return;
    }

    throw this.#error(
      assignment.token,
      "Unsupported assignment right hand side",
    );
  }

  #binary(expression: Binary, target?: number) {
    switch (expression.token.type) {
      case TokenType.BE:
        this.#assignment(expression, target);
        return;
      case TokenType.AND:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR: {
        const falseBranch = this.#subroutines.length;
        const continuation = this.#subroutines.length + 1;
        this.#subroutines[falseBranch] = {
          instructions: [],
          next: [Op.Jump, continuation],
        };
        this.#subroutines[continuation] = {
          instructions: [],
          next: this.#subroutines[this.#currentSubroutine].next,
        };
        this.#subroutines[this.#currentSubroutine].next = [
          Op.Jump,
          continuation,
        ];
        this.#booleanBinary(expression, falseBranch);
        if (target !== undefined) this.#emit([Op.Constant, target, true]);
        this.#currentSubroutine = falseBranch;
        if (target !== undefined) this.#emit([Op.Constant, target, false]);
        this.#currentSubroutine = continuation;
        return;
      }
      default:
        throw this.#error(
          expression.token,
          "Unsupported operation",
        );
    }
  }

  // is this how registers are going to be computed?
  // note that we don't know if the result of the expression is needed for anything.
  // perhaps we need other options.
  #expression(
    expression: Expression,
    target?: number,
  ) {
    switch (expression.constructor) {
      case LiteralBoolean:
        if (target !== undefined) {
          this.#emit([
            Op.Constant,
            target,
            (expression as LiteralBoolean).value,
          ]);
        }
        return;
      case LiteralString:
        if (target !== undefined) {
          this.#emit([
            Op.Constant,
            target,
            (expression as LiteralString).value,
          ]);
        }
        return;
      case New:
        if (target !== undefined) {
          this.#emit([Op.New, target]);
        } // ignore otherwise
        // todo: reconsider if this becomes constructor with side effects
        return;
      case Binary:
        this.#binary(expression as Binary, target);
        return;
      case Variable:
        {
          const register = this.#getRegister(expression as Variable);
          if (target !== undefined) {
            this.#emit([
              Op.Move,
              target,
              register,
            ]);
          }
        }
        return;
      case MemberAccess: {
        const register = this.#allocate();
        this.#expression(
          (expression as MemberAccess).object,
          register,
        );
        if (target !== undefined) {
          this.#emit([
            Op.GetField,
            target,
            register,
            (expression as MemberAccess).field,
          ]);
        }
        this.#deallocate(register);
      }
    }
  }

  #statements(statements: Statement[]) {
    for (const statement of statements) {
      this.#statement(statement);
    }
  }

  // not good enough?
  #statement(statement: Statement) {
    if (statement instanceof Block) {
      const depth = this.#locals.length;
      this.#statements(statement.statements);
      while (this.#locals.length > depth) {
        const register = this.#locals.pop()?.register;
        if (register !== undefined) this.#deallocate(register);
      }
    } else if (statement instanceof IfStatement) {
      if (statement.onFalse) {
        const elseBranch = this.#subroutines.length;
        const continuation = this.#subroutines.length + 1;
        this.#subroutines[elseBranch] = {
          instructions: [],
          next: [Op.Jump, continuation],
        };
        this.#subroutines[continuation] = {
          instructions: [],
          next: this.#subroutines[this.#currentSubroutine].next,
        };
        this.#subroutines[this.#currentSubroutine].next = [
          Op.Jump,
          continuation,
        ];
        this.#boolean(statement.condition, elseBranch);

        // record assignments before for else branch
        this.#written[elseBranch] = new Set(
          this.#written[this.#currentSubroutine],
        );
        this.#statement(statement.onTrue);
        // record assignment after for continuation
        const assignedOnTrue = [
          ...this.#written[this.#currentSubroutine],
        ];
        this.#currentSubroutine = elseBranch;
        this.#statement(statement.onFalse);
        // combine
        this.#written[continuation] = new Set(
          [...this.#written[this.#currentSubroutine]].filter((it) =>
            assignedOnTrue.includes(it)
          ),
        );
        this.#currentSubroutine = continuation;
        return;
      }
      const continuation = this.#subroutines.length;
      this.#subroutines[continuation] = {
        instructions: [],
        next: this.#subroutines[this.#currentSubroutine].next,
      };
      this.#subroutines[this.#currentSubroutine].next = [
        Op.Jump,
        continuation,
      ];
      this.#boolean(statement.condition, continuation);
      // reset assignments
      this.#written[continuation] = new Set(
        this.#written[this.#currentSubroutine],
      );
      this.#statement(statement.onTrue);
      this.#currentSubroutine = continuation;
      // but this is only on false if there is no else branch...
      // perhaps acknowlegde two options?
    } else if (statement instanceof LogStatement) {
      // type checking might make sense for 'print'
      // need print now to inspect memory
      const register = this.#allocate();
      this.#expression(statement.value, register);
      this.#emit([Op.Log, register]);
      this.#deallocate(register);
    } else if (statement instanceof VarDeclaration) {
      const resolve = this.#local(statement.key.name);
      if (resolve !== null) {
        throw this.#error(
          statement.token,
          `Variable '${statement.key}' already in scope since [${resolve.variable.token.line},${resolve.variable.token.column}]`,
        );
      }
      if (statement.value) {
        const register = this.#allocate();
        this.#expression(statement.value, register);
        const local = {
          variable: statement.key,
          register,
        };
        this.#locals.push(local);
        this.#written[this.#currentSubroutine].add(local);
      } else {
        this.#locals.push({ variable: statement.key });
      }
    } else { // expression statements
      // may not be hopeless...
      this.#expression(statement);
    }
  }

  compile(): Method {
    this.#statements(this.script);
    return new Method(this.#size, this.#subroutines);
  }
}
