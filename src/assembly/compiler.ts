import { Instruction, Label, Method, Op } from "./class.ts";
import { Token, TokenType } from "./lexer.ts";
import {
  Binary,
  Block,
  Break,
  Continue,
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
  WhileStatement,
} from "./parser.ts";

type Local = {
  variable: Variable;
  register?: number;
};

type NamedLabel = {
  name?: string;
  break: Label;
  continue: Label;
};

type TypedLabel = {
  label: Label;
  written: Set<Local>;
};

export class Compiler {
  #size = 0;
  #freeRegisters: number[] = [];
  #current: TypedLabel = { label: new Label([Op.Return]), written: new Set() };
  #locals: Local[] = [];
  #names: NamedLabel[] = [];
  constructor(
    readonly script: Statement[],
  ) {}

  #emit(...instructions: Instruction[]) {
    this.#current.label.instructions.push(
      ...instructions,
    );
  }

  #error(token: Token, msg: string) {
    return new Error(
      `Compile error at [${token.line},${token.column}]: ${msg}`,
    );
  }

  #allocate(): number {
    return this.#freeRegisters.pop() ?? this.#size++;
  }

  // add a litle intelligence,
  // to generate fewer move instructions.
  #free(...registers: number[]) {
    this.#freeRegisters.push(
      ...registers.filter((r) => !this.#locals.some((l) => l.register === r)),
    );
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
    return this.#current.written.has(local);
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

  #next() {
    return this.#current.label.next;
  }

  #goto(label: Label) {
    const written = new Set(this.#current.written);
    this.#current = {
      label,
      written,
    };
  }

  #booleanBinary(
    expression: Binary,
    onFalse: Label,
  ) {
    switch (expression.token.type) {
      case TokenType.AND: {
        this.#boolean(expression.left, onFalse);
        const b = new Label(this.#next());
        this.#current.label.next = [Op.Jump, b];
        this.#goto(b);
        this.#boolean(expression.right, onFalse);
        return;
      }
      case TokenType.IS_NOT: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([Op.JumpIfEqual, reg1, reg2, onFalse]);
        this.#free(reg1, reg2);
        return;
      }
      case TokenType.IS: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([
          Op.JumpIfDifferent,
          reg1,
          reg2,
          onFalse,
        ]);
        this.#free(reg1, reg2);
        return;
      }
      case TokenType.LESS: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit(
          // note: changed register ordering!
          [Op.JumpIfNotMore, reg2, reg1, onFalse],
        );
        this.#free(reg1, reg2);
        return;
      }
      case TokenType.MORE: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([Op.JumpIfNotMore, reg1, reg2, onFalse]);
        this.#free(reg1, reg2);
        return;
      }
      case TokenType.NOT_LESS: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([Op.JumpIfLess, reg1, reg2, onFalse]);
        this.#free(reg1, reg2);
        return;
      }
      case TokenType.NOT_MORE: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit(
          // note: changed register ordering!
          [Op.JumpIfLess, reg2, reg1, onFalse],
        );
        this.#free(reg1, reg2);
        return;
      }
      case TokenType.OR: {
        const b = new Label(this.#next());
        this.#boolean(expression.left, b);
        this.#goto(b);
        this.#boolean(expression.right, onFalse);
        return;
      }
      case TokenType.BE: //when everthing is an expression, but then we must take care of partial assignments everywhere as well
      {
        const reg = this.#assignment(expression);
        this.#emit([Op.JumpIfFalse, reg, onFalse]);
        this.#free(reg);
        return;
      }
      // later perhaps
      // case TokenType.SEMICOLON:
      // case TokenType.VAR:
      default:
        throw this.#error(expression.token, "Malformed boolean expression");
    }
  }

  #boolean(
    expression: Expression,
    onFalse: Label,
  ) {
    switch (expression.constructor) {
      case MemberAccess: {
        const reg = this.#expression(expression);
        this.#emit([
          Op.JumpIfFalse,
          reg,
          onFalse,
        ]);
        this.#free(reg);
        return;
      }
      case Binary:
        this.#booleanBinary(expression as Binary, onFalse);
        return;
      case LiteralBoolean: {
        if ((expression as LiteralBoolean).value) {
          return;
        }
        this.#current.label.next = [Op.Jump, onFalse];
        return;
      }
      case Not: {
        const { count, expression: inner } = expression as Not;
        if ((count & 1) === 0) {
          this.#boolean(
            inner,
            onFalse,
          );
          return;
        }
        const next = this.#current.label.next;
        this.#current.label.next = [Op.Jump, onFalse];
        this.#boolean(
          inner,
          next[0] === Op.Jump ? next[1] : new Label(next),
        );
        return;
      }
      case Variable: {
        const reg = this.#getRegister(expression as Variable);
        this.#emit([
          Op.JumpIfFalse,
          reg,
          onFalse,
        ]);
        this.#free(reg);
        return;
      }
      default:
        throw this.#error(expression.token, "Expected boolean");
    }
  }

  #assignment(assignment: Binary): number {
    if (assignment.left instanceof Variable) {
      const local = this.#resolve(assignment.left);
      // local.register could already hav a value and target could be temporary, so...
      // ownership shows up already!
      local.register ??= this.#allocate();
      this.#current.written?.add(
        local,
      );
      const r1 = this.#expression(assignment.right);
      this.#emit([
        Op.Move,
        local.register,
        r1,
      ]);
      return r1;
    }

    if (assignment.left instanceof MemberAccess) {
      // calculate results, store in register 1
      const register1 = this.#expression(assignment.left.object);
      // now calculate the right hand side and store in register 2
      const register2 = this.#expression(assignment.right);
      // move the result to the heap
      this.#emit([
        Op.SetField,
        register1,
        assignment.left.field,
        register2,
      ]);
      this.#free(register1);
      return register2;
    }

    throw this.#error(
      assignment.token,
      "Unsupported assignment right hand side",
    );
  }

  #binary(expression: Binary): number {
    switch (expression.token.type) {
      case TokenType.BE:
        return this.#assignment(expression);
      case TokenType.AND:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR: {
        const continuation = new Label(this.#next());
        const falseBranch = new Label([Op.Jump, continuation]);
        this.#current.label.next = [Op.Jump, continuation];
        const target = this.#allocate();
        this.#emit([Op.Constant, target, true]);
        this.#booleanBinary(expression, falseBranch);
        this.#goto(falseBranch);
        this.#emit([Op.Constant, target, false]);
        this.#goto(continuation);
        return target;
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
  ): number {
    // const target = this.#allocate();
    switch (expression.constructor) {
      case LiteralBoolean: {
        const target = this.#allocate();
        this.#emit([
          Op.Constant,
          target,
          (expression as LiteralBoolean).value,
        ]);
        return target;
      }
      case LiteralString: {
        const target = this.#allocate();
        this.#emit([
          Op.Constant,
          target,
          (expression as LiteralString).value,
        ]);
        return target;
      }
      case New: {
        const target = this.#allocate();
        this.#emit([Op.New, target]);
        return target;
      }
      case Binary:
        return this.#binary(expression as Binary);
      case Variable: {
        const target = this.#allocate();
        this.#emit([
          Op.Move,
          target,
          this.#getRegister(expression as Variable),
        ]);
        return target;
      }
      case MemberAccess: {
        const register = this.#expression(
          (expression as MemberAccess).object,
        );
        const target = this.#allocate();
        this.#emit([
          Op.GetField,
          target,
          register,
          (expression as MemberAccess).field,
        ]);
        this.#free(register);
        return target;
      }
      default:
        throw this.#error(expression.token, "Unexpected expression type");
    }
  }

  // is this how registers are going to be computed?
  // note that we don't know if the result of the expression is needed for anything.
  // perhaps we need other options.
  #expressionStatement(
    expression: Expression,
  ) {
    switch (expression.constructor) {
      case LiteralBoolean:
      case LiteralString:
      case New:
        return;
      case Binary:
        this.#binary(expression as Binary);
        return;
      case Variable:
        this.#getRegister(expression as Variable);
        return;
      case MemberAccess:
        this.#free(this.#expression(
          (expression as MemberAccess).object,
        ));
        return;
      default:
        throw this.#error(expression.token, "Unexpected expression type");
    }
  }

  #statements(statements: Statement[]) {
    for (const statement of statements) {
      this.#statement(statement);
    }
  }

  #block(block: Block) {
    const depth = this.#locals.length;
    this.#statements(block.statements);
    while (this.#locals.length > depth) {
      const register = this.#locals.pop()?.register;
      if (register !== undefined) this.#free(register);
    }
  }

  // not good enough?
  #statement(statement: Statement) {
    switch (statement.constructor) {
      case Break: {
        if (this.#names.length === 0) {
          throw this.#error(statement.token, "Cannot break here");
        }
        const name = (statement as Break).label;
        let target;
        if (name === undefined) {
          target = this.#names[this.#names.length - 1].break;
        } else {
          for (let i = this.#names.length - 1; i >= 0; i--) {
            if (this.#names[i].name === name) {
              target = this.#names[i].break;
            }
          }
          if (!target) {
            throw this.#error(statement.token, `Label ${name} not found`);
          }
        }
        this.#current.label.next = [Op.Jump, target];
        return;
      }
      case Block:
        this.#block(statement as Block);
        return;
      case Continue: {
        if (this.#names.length === 0) {
          throw this.#error(statement.token, "Cannot break here");
        }
        const name = (statement as Continue).label;
        let target;
        if (name === undefined) {
          target = this.#names[this.#names.length - 1].continue;
        } else {
          for (let i = this.#names.length - 1; i >= 0; i--) {
            if (this.#names[i].name === name) {
              target = this.#names[i].continue;
            }
          }
          if (!target) {
            throw this.#error(statement.token, `Label ${name} not found`);
          }
        }
        this.#current.label.next = [Op.Jump, target];
        return;
      }
      case IfStatement: {
        const { condition, onFalse, onTrue } = statement as IfStatement;
        if (onFalse) {
          const continuation = new Label(this.#next());
          const thenBranch = new Label([Op.Jump, continuation]);
          const elseBranch = new Label([Op.Jump, continuation]);
          this.#current.label.next = [
            Op.Jump,
            thenBranch,
          ];
          this.#boolean(condition, elseBranch);
          // record assignments for the else branch
          const we = new Set(
            this.#current.written,
          );
          this.#goto(thenBranch);
          this.#block(onTrue);
          // record assignment after for continuation
          const assignedOnTrue = [
            ...this.#current.written,
          ];
          this.#current = { label: elseBranch, written: we };
          this.#block(onFalse);
          // combine
          this.#current = {
            label: continuation,
            written: new Set(
              [...this.#current.written].filter((it) =>
                assignedOnTrue.includes(it)
              ),
            ),
          };
          return;
        }
        const continuation = new Label(this.#next());
        this.#current.label.next = [
          Op.Jump,
          continuation,
        ];
        this.#boolean(condition, continuation);
        // reset assignments
        const wc = new Set(
          this.#current.written,
        );
        this.#statement(onTrue);
        this.#current = { label: continuation, written: wc };
        return;
      }
      case LogStatement: {
        // type checking might make sense for 'print'
        // need print now to inspect memory
        const register = this.#expression((statement as LogStatement).value);
        this.#emit([Op.Log, register]);
        this.#free(register);
        return;
      }
      case VarDeclaration: {
        const { key, value } = statement as VarDeclaration;
        const resolve = this.#local(key.name);
        if (resolve !== null) {
          throw this.#error(
            statement.token,
            `Variable '${key}' already in scope since [${resolve.variable.token.line},${resolve.variable.token.column}]`,
          );
        }
        if (value) {
          const register = this.#expression(value);
          const local = {
            variable: key,
            register,
          };
          this.#locals.push(local);
          this.#current.written?.add(local);
        } else {
          this.#locals.push({ variable: key });
        }
        return;
      }
      case WhileStatement: {
        const { condition, onTrue, label } = statement as WhileStatement;
        const continuation = new Label(this.#next());
        const loopA = new Label(this.#next());
        const loopB = new Label([Op.Jump, loopA]);
        this.#current.label.next = [Op.Jump, loopA];
        loopA.next = [Op.Jump, loopB];

        this.#goto(loopA);
        this.#boolean(condition, continuation);
        const written = new Set(
          this.#current.written,
        );

        this.#goto(loopB);
        this.#names.push({
          name: label,
          break: continuation,
          continue: loopA,
        });
        this.#block(onTrue);
        this.#names.pop();
        this.#current = { label: continuation, written };
        return;
      }
      default:
        this.#expressionStatement(statement);
        return;
    }
  }

  compile(): Method {
    const start = this.#current.label;
    this.#statements(this.script);
    Compiler.mergeLabels(start);
    return new Method(this.#size, start);
  }

  static mergeLabels(start: Label) {
    // collect all labels.
    const labels = [start];
    const jumps = [];
    for (let i = 0; i < labels.length; i++) {
      for (const ins of [...labels[i].instructions, labels[i].next]) {
        let labelIndex = 0;
        let other = start;
        switch (ins[0]) {
          case Op.Jump:
            labelIndex = 1;
            other = ins[1];
            break;
          case Op.JumpIfDifferent:
          case Op.JumpIfLess:
          case Op.JumpIfEqual:
          case Op.JumpIfNotMore:
            labelIndex = 3;
            other = ins[3];
            break;
          case Op.JumpIfFalse:
          case Op.JumpIfTrue:
            labelIndex = 2;
            other = ins[2];
            break;
          default:
            continue;
        }
        // eliminate the empty labels
        while (other.instructions.length === 0) {
          if (other.next[0] === Op.Return) break;
          other = other.next[1];
        }
        ins[labelIndex] = other;
        jumps.push(i);
        if (other && !labels.includes(other)) labels.push(other);
      }
    }
  }
}
