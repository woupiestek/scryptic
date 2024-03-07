import { TokenType } from "./lexer.ts";
import {
  Access,
  Binary,
  Block,
  Break,
  Call,
  Continue,
  Expression,
  IfStatement,
  Literal,
  Log,
  New,
  Not,
  Return,
  Statement,
  VarDeclaration,
  Variable,
  WhileStatement,
} from "./parser.ts";

// control flow graph && ssa (maybe)

export type Edge =
  | ["return", Expression | undefined]
  | ["goto", BasicBlock] // goto $1
  | ["if", Expression, BasicBlock, BasicBlock]; // if $1 { $2 } else { $3 }

function stringifyExpression(expression: Expression): string {
  switch (expression.constructor) {
    case Access:
      return `(${
        [
          TokenType[expression.token.type],
          stringifyExpression((expression as Access).object),
          (expression as Access).field,
        ].join(" ")
      })`;
    case Binary:
      return `(${
        [
          TokenType[expression.token.type],
          stringifyExpression((expression as Binary).left),
          stringifyExpression((expression as Binary).right),
        ].join(" ")
      })`;
    case Call:
      return `(${
        [
          TokenType[expression.token.type],
          stringifyExpression((expression as Call).operator),
          ...(expression as Call).operands.map(stringifyExpression),
        ].join(" ")
      })`;
    case Literal:
      return JSON.stringify((expression as Literal).value);
    case Log:
      return `(${
        [
          TokenType[expression.token.type],
          stringifyExpression((expression as Log).value),
        ].join(" ")
      })`;
    case New:
      return `(${
        [
          TokenType[expression.token.type],
          (expression as New).klaz,
          ...(expression as New).operands.map(stringifyExpression),
        ].join(" ")
      })`;
    case Not:
      return `(${
        [
          TokenType[expression.token.type],
          stringifyExpression((expression as Not).expression),
        ].join(" ")
      })`;
    case VarDeclaration:
      return `(${
        [
          TokenType[expression.token.type],
          stringifyExpression((expression as VarDeclaration).key),
        ].join(" ")
      })`;
    case Variable:
      return `(${
        [
          TokenType[expression.token.type],
          (expression as Variable).name,
        ].join(" ")
      })`;
    default:
      return "[ERROR]";
  }
}

export class BasicBlock {
  readonly expressions: Expression[] = [];
  jump: Edge;
  constructor(
    jump: Edge,
  ) {
    this.jump = jump;
  }

  toString() {
    const blocks: BasicBlock[] = [this];
    const results: string[][] = [];
    function blockIndex(block: BasicBlock) {
      let i = blocks.indexOf(block);
      if (i < 0) {
        i = blocks.length;
        blocks[i] = block;
      }
      return i;
    }
    for (let i = 0; i < blocks.length; i++) {
      results[i] = blocks[i].expressions.map(stringifyExpression);
      const jump = blocks[i].jump;
      switch (jump[0]) {
        case "goto":
          results[i].push(`(goto ${blockIndex(jump[1])})`);
          break;
        case "return":
          results[i].push(
            jump[1] === undefined
              ? "(return)"
              : `(return ${stringifyExpression(jump[1])})`,
          );
          break;
        case "if":
          results[i].push(
            `(if ${stringifyExpression(jump[1])} ${blockIndex(jump[2])} ${
              blockIndex(jump[3])
            })`,
          );
      }
    }
    return results.map((block, index) => [`#${index}:`, ...block].join("\n  "))
      .join("\n");
  }
  //
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
          current.expressions.push(statement as Expression);break;
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
