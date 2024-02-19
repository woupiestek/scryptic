import { Instruction, Method, Op } from "./class.ts";
import {
  LeftExpression,
  NodeType,
  RightExpression,
  Statements,
} from "./parser.ts";

type Local = {
  name: string;
  register: number;
};
export class Compiler {
  #size = 0;
  #locals: Local[] = [];
  constructor(
    readonly script: Statements,
  ) {}

  #freeRegister() {
    return this.#size++;
  }

  #local(name: string): Local | null {
    for (let i = this.#locals.length - 1; i >= 0; i--) {
      if (this.#locals[i].name === name) {
        return this.#locals[i];
      }
    }
    return null;
  }

  // is this how registers are going to be computed?
  // note that we don't know if the result of the expression is needed for anything.
  // perhaps we need other options.
  #right(
    expression: RightExpression,
    instructions: Instruction[],
    target?: number,
  ) {
    switch (expression[0]) {
      case NodeType.String:
        if (target !== undefined) {
          instructions.push([Op.Constant, target, expression[1]]);
        }
        // just drop the constant otherwise.
        break;
      case NodeType.Assignment:
        // interesting case...
        {
          const register = target ?? this.#freeRegister();
          this.#right(expression[2], instructions, register);
          this.#left(expression[1], instructions, register);
        }
        break;
      case NodeType.Local:
        // not the same thing...
        if (target) {
          const local = this.#local(expression[1]);
          if (local != null) {
            instructions.push([Op.Move, target, local.register]);
          }
        }
    }
  }

  #left(
    expression: LeftExpression,
    instructions: Instruction[],
    target: number,
  ) {
    switch (expression[0]) {
      case NodeType.Local: {
        const local = this.#local(expression[1]);
        if (local) {
          local.register = target;
        } else {
          this.#locals.push({ name: expression[1], register: target });
        }
      } // nothing emitted
    }
  }

  #statements(statements: Statements, instructions: Instruction[]) {
    for (const statement of statements) {
      switch (statement[0]) {
        case NodeType.Block: {
          const depth = this.#locals.length;
          this.#statements(statement[1], instructions);
          this.#locals.length = depth;
          break;
        }
        case NodeType.Expression:
          // expression statements
          // may not be hopeless...
          this.#right(statement[1], instructions);
          break;
        case NodeType.Print: {
          const reg = this.#freeRegister();
          this.#right(statement[1], instructions, reg);
          instructions.push([Op.Print, reg]);
          break;
        }
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
