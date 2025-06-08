import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { TokenType } from "./lexer.ts";

class Stack {
  #index = -1;
  #instructions: number[] = [];
  isEmpty() {
    return this.#index < 0;
  }
  push(...instructions: number[]) {
    for (let i = instructions.length - 1; i >= 0; i--) {
      this.#instructions[++this.#index] = instructions[i];
    }
  }
  pop() {
    assert(this.#index >= 0);
    return this.#instructions[this.#index--];
  }
  size() {
    return this.#index + 1;
  }
}

export enum Op {
  Args,
  ArgsTail,
  Block,
  BlockEnd,
  Else,
  Expect,
  Expr,
  ExprHead,
  ExprTail,
  Identifier,
  Label,
  ReturnValue,
  Semicolon,
  Stmt,
  Stmts,
}

const PRECEDENCE_A: number[] = [];
PRECEDENCE_A[TokenType.AND] = 2;
PRECEDENCE_A[TokenType.BE] = 1;
PRECEDENCE_A[TokenType.DOT] = 4;
PRECEDENCE_A[TokenType.IS_NOT] = 3;
PRECEDENCE_A[TokenType.IS] = 3;
PRECEDENCE_A[TokenType.LESS] = 3;
PRECEDENCE_A[TokenType.MORE] = 3;
PRECEDENCE_A[TokenType.NOT_LESS] = 3;
PRECEDENCE_A[TokenType.NOT_MORE] = 3;
PRECEDENCE_A[TokenType.OR] = 2;
PRECEDENCE_A[TokenType.PAREN_LEFT] = 0;

const PRECEDENCE_B: number[] = [...PRECEDENCE_A];
PRECEDENCE_B[TokenType.BE] = 0;
PRECEDENCE_B[TokenType.PAREN_LEFT] = 4;

export type Listener = {
  push: (op: Op, token: number) => void;
  pop: (count: number) => void;
  stop: () => void;
};

export class Parser {
  #stack = new Stack();
  #token = 0;

  constructor(readonly frames: Listener = new Frames()) {
    this.#stack.push(Op.Stmts, Op.Expect, TokenType.END);
  }

  visitAll(types: TokenType[]) {
    for (const type of types) {
      this.visit(type);
    }
    assert(this.#stack.size() === 0);
    this.frames.stop();
  }

  visit(type: TokenType) {
    while (!this.#accept(type));
    this.#token++;
  }

  #error(message: string) {
    return new Error(`@${this.#token}: ${message}`);
  }

  #accept(type: TokenType) {
    this.#popFrames();
    switch (this.#pushFrame(this.#stack.pop())) {
      case Op.Label:
        return type === TokenType.LABEL;
      case Op.ExprTail:
        return this.#exprTail(type, this.#stack.pop());
      case Op.Block:
        this.#stack.push(
          Op.Expect,
          TokenType.BRACE_LEFT,
          Op.Stmts,
          Op.BlockEnd,
          Op.Expect,
          TokenType.BRACE_RIGHT,
        );
        return false;
      case Op.Else:
        if (type === TokenType.ELSE) {
          this.#stack.push(Op.Block);
          return true;
        }
        return false;
      case Op.Expect: {
        const operand = this.#stack.pop();
        if (type === operand) return true;
        throw this.#error(
          `${TokenType[operand as TokenType]} expected, ${
            TokenType[type]
          } received`,
        );
      }
      case Op.Expr:
        this.#stack.push(Op.ExprHead, Op.ExprTail, this.#stack.pop());
        return false;
      case Op.Identifier: {
        if (type === TokenType.IDENTIFIER) return true;
        throw this.#error(
          `Identifier expected, ${TokenType[type]} received`,
        );
      }
      case Op.ReturnValue:
        if (type !== TokenType.BRACE_RIGHT) this.#stack.push(Op.Expr, 0);
        return false;
      case Op.Semicolon:
        if (type === TokenType.BRACE_RIGHT || type === TokenType.END) {
          return false;
        }
        if (type === TokenType.SEMICOLON) {
          return true;
        }
        throw this.#error(`Expected ";" or "}", received ${TokenType[type]}`);
      case Op.Stmts:
        switch (type) {
          case TokenType.BRACE_RIGHT:
          case TokenType.BREAK:
          case TokenType.CONTINUE:
          case TokenType.END:
          case TokenType.RETURN:
            break;
          default:
            this.#stack.push(Op.Stmt, Op.Stmts);
            break;
        }
        return false;
      case Op.BlockEnd:
        switch (type) {
          case TokenType.BREAK:
          case TokenType.CONTINUE:
            this.#stack.push(Op.Label);
            break;
          case TokenType.RETURN:
            this.#stack.push(Op.ReturnValue);
            break;
          default:
            return false;
        }
        return true;
      case Op.Stmt:
        return this.#statement(type);
      case Op.Args:
        if (type === TokenType.PAREN_RIGHT) return true;
        this.#stack.push(Op.Expr, 0, Op.ArgsTail);
        return false;
      case Op.ArgsTail:
        if (type === TokenType.PAREN_RIGHT) return true;
        if (type === TokenType.COMMA) {
          this.#stack.push(Op.Expr, 0, Op.ArgsTail);
          return true;
        }
        throw this.#error(`Expected "," or ")" but found ${TokenType[type]}`);
      case Op.ExprHead:
        return this.#exprHead(type);
    }
  }

  #exprHead(type: TokenType) {
    switch (type) {
      case TokenType.FALSE:
      case TokenType.IDENTIFIER:
      case TokenType.STRING:
      case TokenType.THIS:
      case TokenType.TRUE:
        return true;
      case TokenType.LOG:
      case TokenType.NOT:
      case TokenType.NEW:
        this.#stack.push(Op.ExprHead);
        return true;
      case TokenType.VAR:
        this.#stack.push(Op.Identifier);
        return true;
      case TokenType.PAREN_LEFT:
        this.#stack.push(Op.Expr, 0, Op.Expect, TokenType.PAREN_RIGHT);
        return true;
      default:
        throw this.#error("Expression expected");
    }
  }

  #exprTail(type: TokenType, precedence: number) {
    switch (type) {
      case TokenType.AND:
      case TokenType.BE:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR:
        if (PRECEDENCE_B[type] < precedence) return false;
        this.#stack.push(Op.Expr, PRECEDENCE_A[type], Op.ExprTail, precedence);
        return true;
      case TokenType.DOT:
        this.#stack.push(
          Op.Identifier,
          Op.ExprTail,
          precedence,
        );
        return true;
      case TokenType.PAREN_LEFT:
        this.#stack.push(Op.Args, Op.ExprTail, precedence);
        return true;
      case TokenType.BRACE_LEFT: // if, while
      case TokenType.BRACE_RIGHT: // after if, while
      case TokenType.COMMA:
      case TokenType.END:
      case TokenType.ERROR:
      case TokenType.PAREN_RIGHT:
      case TokenType.SEMICOLON:
        return false;
      default:
        throw this.#error(
          `Expected binary operator or expression ending, not ${
            TokenType[type]
          }`,
        );
    }
  }

  #statement(type: TokenType) {
    switch (type) {
      case TokenType.BRACE_RIGHT:
      case TokenType.BREAK:
      case TokenType.CONTINUE:
      case TokenType.END:
      case TokenType.RETURN:
        throw this.#error("Statement expected");
      case TokenType.BRACE_LEFT:
        this.#stack.push(Op.Block);
        return false;
      case TokenType.IF:
        this.#stack.push(Op.Expr, 0, Op.Block, Op.Else);
        return true;
      case TokenType.LABEL:
        this.#stack.push(
          Op.Expect,
          TokenType.WHILE,
          Op.Expr,
          0,
          Op.Block,
        );
        return true;
      case TokenType.WHILE:
        this.#stack.push(Op.Expr, 0, Op.Block);
        return true;
      default:
        this.#stack.push(Op.Expr, 0, Op.Semicolon);
        return false;
    }
  }

  // the parser still determines the shape of the tree
  #sizes: number[] = [];

  #popFrames() {
    if (this.#sizes.length === 0) return;
    const size = this.#stack.size();
    let l = this.#sizes.length;
    // binary search new length
    for (let i = 0; i + 1 < l;) {
      const k = (i + l) >> 1;
      if (this.#sizes[k] < size) {
        i = k;
      } else {
        l = k;
      }
    }
    if (this.#sizes.length > l) {
      this.frames.pop(l);
      this.#sizes.length = l;
    }
  }

  #pushFrame(op: Op) {
    switch (op) {
      case Op.Args:
      case Op.Block:
      case Op.BlockEnd:
      case Op.Else:
      case Op.Expr:
      case Op.ExprHead:
      case Op.ExprTail:
      case Op.Identifier:
      case Op.Label:
      case Op.Stmt:
      case Op.Stmts:
        this.frames.push(op, this.#token);
        this.#sizes.push(this.#stack.size());
    }
    return op;
  }
}

export class Frames {
  #ops: Op[] = [];
  #tokens: number[] = [];
  #depth: number[] = [];

  size(): number {
    return this.#depth.length;
  }

  isLeaf(id: number) {
    return !(this.#depth[id] < this.#depth[id + 1]);
  }

  op(id: number) {
    assert(id < this.#ops.length, "out of range");
    return this.#ops[id] ?? -1;
  }

  depth(id: number) {
    return this.#depth[id] ?? -1;
  }

  token(id: number) {
    assert(id < this.#tokens.length);
    return this.#tokens[id] ?? -1;
  }

  children(id: number) {
    assert(id < this.#depth.length);
    const depth = this.#depth[id];
    const result = [];
    for (let i = id + 1, l = this.#depth.length; i < l; i++) {
      if (this.#depth[i] <= depth) break;
      if (this.#depth[i] === depth + 1) result.push(i);
    }
    return result;
  }

  #currentDepth: number = 0;

  push(op: Op, token: number) {
    this.#ops.push(op);
    this.#depth.push(this.#currentDepth++);
    this.#tokens.push(token);
  }

  pop(l: number) {
    this.#currentDepth = l;
  }

  stringify(): string {
    return this.#depth.keys().map((id) =>
      "  ".repeat(this.depth(id)) +
      `${Op[this.op(id)]}: ${this.token(id)}`
    ).toArray().join("\n");
  }

  stop() {
    console.log(this.stringify());
  }
}
