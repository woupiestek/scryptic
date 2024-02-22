import { Instruction, Method, Op } from "./class.ts";
import { Token } from "./lexer.ts";
import {
  Assignment,
  Block,
  LiteralString,
  New,
  PrintStatement,
  RightExpression,
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
  #locals: Local[] = [];
  constructor(
    readonly script: Statement[],
  ) {}

  #error(token: Token, msg: string) {
    return new Error(
      `Compile error at [${token.line},${token.column}]: ${msg}`,
    );
  }

  #freeRegister() {
    return this.#size++;
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
    instructions: Instruction[],
    target?: number,
  ) {
    if (expression instanceof LiteralString) {
      if (target !== undefined) {
        instructions.push([Op.Constant, target, expression.value]);
      }
    } else if (expression instanceof New) {
      if (target !== undefined) {
        instructions.push([Op.New, target]);
      } // ignore otherwise
    } else if (
      expression instanceof Assignment
    ) {
      const local = this.#resolve(expression.left);
      local.register ||= this.#freeRegister();
      this.#right(expression.right, instructions, local.register);
    } else if (
      expression instanceof Variable
    ) {
      const register = this.#getRegister(expression);
      if (target !== undefined) {
        instructions.push([Op.Move, target, register]);
      }
    }
  }

  #statements(statements: Statement[], instructions: Instruction[]) {
    for (const statement of statements) {
      if (statement instanceof Block) {
        const depth = this.#locals.length;
        this.#statements(statement.statements, instructions);
        this.#locals.length = depth;
      } else if (statement instanceof PrintStatement) {
        // type checking might make sense for 'print'
        const reg = this.#freeRegister();
        this.#right(statement.value, instructions, reg);
        instructions.push([Op.Print, reg]);
      } else if (statement instanceof VarDeclaration) {
        const resolve = this.#local(statement.key.name);
        if (resolve !== null) {
          throw this.#error(
            statement.token,
            `Variable '${statement.key}' already in scope since [${resolve.variable.token.line},${resolve.variable.token.column}]`,
          );
        }
        if (statement.value) {
          const register = this.#freeRegister();
          this.#right(statement.value, instructions, register);
          this.#locals.push({ variable: statement.key, register });
        } else {
          this.#locals.push({ variable: statement.key });
        }
      } else { // expression statements
        // may not be hopeless...
        this.#right(statement, instructions);
      }
    }
  }

  compile(): Method {
    const instructions: Instruction[] = [];
    this.#statements(this.script, instructions);
    return new Method(this.#size, {
      start: { instructions, next: [Op.Return] },
    });
  }
}
