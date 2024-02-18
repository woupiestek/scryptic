import { Instruction, Method, Op } from "./class.ts";
import { Expression, Statement } from "./parser.ts";

export class Compiler {
  size = 0;
  constructor(
    readonly script: Statement[],
  ) {}

  #freeReg() {
    return this.size++;
  }

  // is this how registers are going to be computed?
  // note that we don't know if the result of the expression is needed for anything.
  #expression(expression: Expression, instructions: Instruction[]): number {
    const reg = this.#freeReg();
    switch (expression[0]) {
      case "string":
        {
          instructions.push([Op.Constant, reg, expression[1]]);
        }
        return reg;
    }
  }

  #statements(statements: Statement[], instructions: Instruction[]) {
    for (const statement of statements) {
      switch (statement[0]) {
        case "block":
          this.#statements(statement[1], instructions);
          break;
        case "print": {
          const reg = this.#expression(statement[1], instructions);
          instructions.push([Op.Print, reg]);
          break;
        }
        case "expression":
          this.#expression(statement[1], instructions);
          break;
      }
    }
  }

  compile(): Method {
    const instructions: Instruction[] = [];
    this.#statements(this.script, instructions);
    return new Method(this.size, {
      start: { instructions, next: [Op.Return] },
    });
  }
}
