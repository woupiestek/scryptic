import { Method, Op, Subroutine } from "./class.ts";
import { Token } from "./lexer.ts";
import {
  Assignment,
  Block,
  IfStatement,
  LiteralBoolean,
  LiteralString,
  LogStatement,
  MemberAccess,
  New,
  RightExpression,
  Statement,
  VarDeclaration,
  Variable,
} from "./parser.ts";

type Local = {
  variable: Variable;
  register?: number;
};

type JumpTarget = { label: number; setVariables: Set<string> };

export class Compiler {
  #size = 0;
  #secondHandRegisters: number[] = [];
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

  // is this how registers are going to be computed?
  // note that we don't know if the result of the expression is needed for anything.
  // perhaps we need other options.
  #right(
    expression: RightExpression,
    subroutine: Subroutine,
    target?: number,
  ) {
    if (expression instanceof LiteralBoolean) {
      if (target !== undefined) {
        subroutine.instructions.push([Op.Constant, target, expression.value]);
      }
    } else if (expression instanceof LiteralString) {
      if (target !== undefined) {
        subroutine.instructions.push([Op.Constant, target, expression.value]);
      }
    } else if (expression instanceof New) {
      if (target !== undefined) {
        subroutine.instructions.push([Op.New, target]);
      } // ignore otherwise
    } else if (
      expression instanceof Assignment
    ) {
      if (expression.left instanceof Variable) {
        const local = this.#resolve(expression.left);
        // local.register could already hav a value and target could be temporary, so...
        // ownership shows up already!
        local.register ||= this.#allocate();
        this.#right(expression.right, subroutine, local.register);
        if (target !== undefined) {
          subroutine.instructions.push([Op.Move, target, local.register]);
        }
      } else if (expression.left instanceof MemberAccess) {
        // calculate results, store in register 1
        const register1 = this.#allocate();
        this.#right(expression.left.target, subroutine, register1);
        // now calculate the right hand side and store in register 2
        const register2 = this.#allocate();
        this.#right(expression.right, subroutine, register2);
        // move the result to the heap
        subroutine.instructions.push([
          Op.SetField,
          register1,
          expression.left.member,
          register2,
        ]);
        this.#deallocate(register1, register2);
        // neither register is needed anymore
      } else {
        this.#error(expression.token, `Not rules for ${expression}`);
      }
    } else if (
      expression instanceof Variable
    ) {
      const register = this.#getRegister(expression);
      if (target !== undefined) {
        subroutine.instructions.push([Op.Move, target, register]);
      }
    } else if (expression instanceof MemberAccess) {
      const register = this.#allocate();
      this.#right(expression.target, subroutine, register);
      if (target !== undefined) {
        subroutine.instructions.push([
          Op.GetField,
          target,
          register,
          expression.member,
        ]);
      }
      this.#deallocate(register);
    }
  }

  // boole expression might require an 'on false' label

  #statements(statements: Statement[], subroutine: Subroutine) {
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
        this.#right(statement.value, subroutine, register);
        subroutine.instructions.push([Op.Log, register]);
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
          this.#right(statement.value, subroutine, register);
          this.#locals.push({ variable: statement.key, register });
        } else {
          this.#locals.push({ variable: statement.key });
        }
      } else { // expression statements
        // may not be hopeless...
        this.#right(statement, subroutine);
      }
    }
  }

  compile(): Method {
    const subroutine: Subroutine = { instructions: [], next: [Op.Return] };
    this.#statements(this.script, subroutine);
    return new Method(this.#size, [subroutine]);
  }
}
