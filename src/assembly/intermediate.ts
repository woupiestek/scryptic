import {
  Block,
  Break,
  Continue,
  Expression,
  IfStatement,
  Return,
  Statement,
  WhileStatement,
} from "./parser.ts";

// control flow graph && ssa (maybe)

export type Edge =
  | ["return", Expression | undefined]
  | ["goto", BasicBlock] // goto $1
  | ["if", Expression, BasicBlock, BasicBlock]; // if $1 { $2 } else { $3 }

export class BasicBlock {
  readonly expressions: Expression[] = [];
  jump: Edge;
  constructor(
    jump: Edge,
  ) {
    this.jump = jump;
  }
}

type Labeled = {
  label?: string;
  break: BasicBlock;
  continue: BasicBlock;
};

export class Grapher {
  #labels: Labeled[] = [];

  #getLabel(label?: string): Labeled {
    if (label) {
      for (let i = this.#labels.length - 1; i >= 0; i--) {
        if (this.#labels[i].label === label) {
          return this.#labels[this.#labels.length - 1];
        }
      }
    } else {
      if (this.#labels.length > 0) {
        return this.#labels[this.#labels.length - 1];
      }
    }
    throw new Error("missing label " + label);
  }

  #addStatements(statements: Statement[], current: BasicBlock, end: Edge) {
    for (const statement of statements) {
      switch (statement.constructor) {
        case Block: {
          const cont = new BasicBlock(end);
          // todo: scoping
          this.#addStatements((statement as Block).statements, current, [
            "goto",
            cont,
          ]);
          current = cont;
          break;
        }
        case IfStatement: {
          const cont = new BasicBlock(end);
          const { condition, onTrue, onFalse } = statement as IfStatement;
          const thenBranch = this.compile(onTrue, ["goto", cont]);
          const elseBranch = onFalse
            ? this.compile(onFalse, ["goto", cont])
            : new BasicBlock(["goto", cont]);
          current.jump = ["if", condition, thenBranch, elseBranch];
          current = cont;
          break;
        }
        case WhileStatement: {
          const cont = new BasicBlock(end);
          const { condition, onTrue, label } = statement as WhileStatement;
          const loopA = new BasicBlock(["return", undefined]);
          const loopB = this.compile(onTrue, ["goto", loopA]);
          loopA.jump = ["if", condition, loopB, cont];
          current = cont;
          if (label) {
            this.#labels.push({
              label: label,
              break: cont,
              continue: loopA,
            });
          }
          break;
        }
        default:
          current.expressions.push(statement as Expression);
      }
    }
    current.jump = end;
  }

  compile(block: Block, end: Edge = ["return", undefined]): BasicBlock {
    if (block.jump) {
      switch (block.jump.constructor) {
        case Break: {
          const { label } = block.jump as Break;
          end = ["goto", this.#getLabel(label).break];
          break;
        }
        case Continue: {
          const { label } = block.jump as Continue;
          end = ["goto", this.#getLabel(label).continue];
          break;
        }
        case Return:
          end = ["return", (block.jump as Return).expression];
          break;
      }
    }
    const start = new BasicBlock(end);
    this.#addStatements(block.statements, start, end);
    return start;
  }
}
