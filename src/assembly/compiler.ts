import { Method, Op, Subroutine } from "./class.ts";
import { Token, TokenType } from "./lexer.ts";
import {
  Binary,
  Block,
  Expression,
  LiteralBoolean,
  LiteralString,
  LogStatement,
  MemberAccess,
  New,
  Statement,
  VarDeclaration,
  Variable,
} from "./parser.ts";

type Local = {
  variable: Variable;
  register?: number;
};

export class Compiler {
  #size = 0;
  #secondHandRegisters: number[] = [];
  // add something to track available variables at every point
  #subroutines: Subroutine[] = [{ instructions: [], next: [Op.Return] }];
  #locals: Local[] = [];
  constructor(
    readonly script: Statement[],
  ) {}

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

  #getRegister(variable: Variable): number {
    const register = this.#resolve(variable).register;
    if (register === undefined) {
      throw this.#error(
        variable.token,
        `Unassigned variable '${variable.name}'`,
      );
    }
    return register;
  }

  #assignment(assignment: Binary, subroutine: number, target?: number) {
    if (assignment.left instanceof Variable) {
      const local = this.#resolve(assignment.left);
      // local.register could already hav a value and target could be temporary, so...
      // ownership shows up already!
      local.register ||= this.#allocate();
      this.#expression(assignment.right, subroutine, local.register);
      if (target !== undefined) {
        this.#subroutines[subroutine].instructions.push([
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
      this.#expression(assignment.left.object, subroutine, register1);
      // now calculate the right hand side and store in register 2
      const register2 = this.#allocate();
      this.#expression(assignment.right, subroutine, register2);
      // move the result to the heap
      this.#subroutines[subroutine].instructions.push([
        Op.SetField,
        register1,
        assignment.left.field,
        register2,
      ]);
      this.#deallocate(register1, register2);
      // neither register is needed anymore
      return;
    }

    throw this.#error(
      assignment.token,
      "Unsupported assignment right hand side",
    );
  }

  #binary(expression: Binary, subroutine: number, target?: number) {
    switch (expression.token.type) {
      case TokenType.BE:
        this.#assignment(expression, subroutine, target);
        return;
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
    subroutine: number,
    target?: number,
  ) {
    switch (expression.constructor) {
      case LiteralBoolean:
        if (target !== undefined) {
          this.#subroutines[subroutine].instructions.push([
            Op.Constant,
            target,
            (expression as LiteralBoolean).value,
          ]);
        }
        return;
      case LiteralString:
        if (target !== undefined) {
          this.#subroutines[subroutine].instructions.push([
            Op.Constant,
            target,
            (expression as LiteralString).value,
          ]);
        }
        return;
      case New:
        if (target !== undefined) {
          this.#subroutines[subroutine].instructions.push([Op.New, target]);
        } // ignore otherwise
        // todo: reconsider if this becomes consrtuctor with side effects
        return;
      case Binary:
        this.#binary(expression as Binary, subroutine, target);
        return;
      case Variable:
        {
          const register = this.#getRegister(expression as Variable);
          if (target !== undefined) {
            this.#subroutines[subroutine].instructions.push([
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
          subroutine,
          register,
        );
        if (target !== undefined) {
          this.#subroutines[subroutine].instructions.push([
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

  #statements(statements: Statement[], subroutine: number) {
    for (const statement of statements) {
      if (statement instanceof Block) {
        const depth = this.#locals.length;
        this.#statements(statement.statements, subroutine);
        while (this.#locals.length > depth) {
          const register = this.#locals.pop()?.register;
          if (register !== undefined) this.#deallocate(register);
        }
      } else if (statement instanceof LogStatement) {
        // type checking might make sense for 'print'
        // need print now to inspect memory
        const register = this.#allocate();
        this.#expression(statement.value, subroutine, register);
        this.#subroutines[subroutine].instructions.push([Op.Log, register]);
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
          this.#expression(statement.value, subroutine, register);
          this.#locals.push({ variable: statement.key, register });
        } else {
          this.#locals.push({ variable: statement.key });
        }
      } else { // expression statements
        // may not be hopeless...
        this.#expression(statement, subroutine);
      }
    }
  }

  compile(): Method {
    this.#statements(this.script, 0);
    return new Method(this.#size, this.#subroutines);
  }
}
