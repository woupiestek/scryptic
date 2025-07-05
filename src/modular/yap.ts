import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { TokenType } from "./lexer.ts";

class Stack {
  #index = -1;
  #ops: Uint8Array = new Uint8Array(64);
  #depths: Uint8Array = new Uint8Array(64);
  #depth = 0;

  push(...instructions: number[]) {
    for (let i = instructions.length - 1; i >= 0; i--) {
      this.#ops[++this.#index] = instructions[i];
      this.#depths[this.#index] = this.#depth;
    }
  }

  get depth() {
    assert(this.#index >= 0);
    return this.#depths[this.#index];
  }

  pop() {
    assert(this.#index >= 0);
    // could easily producte the parent vector as well...
    // the trouble is just that tokens & precedences are thrown in here as well.
    this.#depth = 1 + this.#depths[this.#index];
    return this.#ops[this.#index--];
  }

  top() {
    assert(this.#index >= 0);
    return this.#ops[this.#index];
  }

  stop() {
    assert(this.#index === -1);
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
PRECEDENCE_A[TokenType.PAREN_LEFT] = 1;

const PRECEDENCE_B: number[] = [...PRECEDENCE_A];
PRECEDENCE_B[TokenType.BE] = 0;
PRECEDENCE_B[TokenType.PAREN_LEFT] = 0;

export class Parser {
  #stack = new Stack();
  #token = 0;
  readonly frames = new Frames();

  constructor() {
    this.#stack.push(Op.Stmts, Op.Expect, TokenType.END);
  }

  visitAll(types: TokenType[]) {
    for (const type of types) {
      this.visit(type);
    }
    this.#stack.stop();
  }

  visit(type: TokenType) {
    while (!this.#accept(type));
    this.#token++;
  }

  #error(message: string) {
    return new Error(`@${this.#token}: ${message}`);
  }

  #accept(type: TokenType) {
    this.#pushFrame();
    switch (this.#stack.pop()) {
      case Op.Label:
        return type === TokenType.LABEL;
      case Op.ExprTail:
        return this.#exprTail(type);
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
        this.#stack.push(Op.ExprHead, Op.ExprTail);
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

  #exprTail(type: TokenType) {
    if ((PRECEDENCE_A[type] ?? -1) < this.#stack.top()) {
      this.#stack.pop();
      return false;
    }
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
        this.#stack.push(Op.Expr, PRECEDENCE_B[type], Op.ExprTail);
        return true;
      case TokenType.DOT:
        // '(var x = new A()).y = "right!"; log(x.y)' goes wrong... why!?
        // ''
        this.#stack.push(
          Op.Identifier,
          Op.ExprTail,
        );
        return true;
      case TokenType.PAREN_LEFT:
        this.#stack.push(Op.Args, Op.ExprTail);
        return true;
      case TokenType.BRACE_LEFT: // if, while
      case TokenType.BRACE_RIGHT: // after if, while
      case TokenType.COMMA:
      case TokenType.END:
      case TokenType.ERROR:
      case TokenType.PAREN_RIGHT:
      case TokenType.SEMICOLON:
        this.#stack.pop();
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

  #pushFrame() {
    this.frames.push(this.#stack.top(), this.#token, this.#stack.depth);
  }
}

export class Frames {
  ops: Op[] = [];
  tokens: number[] = [];
  depths: number[] = [];
  parents: number[] = [];

  size(): number {
    return this.depths.length;
  }

  isLeaf(id: number) {
    return !(this.depths[id] < this.depths[id + 1]);
  }

  op(id: number) {
    assert(id < this.ops.length, "out of range");
    return this.ops[id] ?? -1;
  }

  depth(id: number) {
    return this.depths[id] ?? 0;
  }

  token(id: number) {
    return this.tokens[id] ?? -1;
  }

  parent(id: number) {
    return this.parents[id];
  }

  children(id: number) {
    assert(id < this.depths.length);
    const depth = this.depths[id];
    const result = [];
    for (let i = id + 1, l = this.depths.length; i < l; i++) {
      if (this.depths[i] <= depth) break;
      if (this.depths[i] === depth + 1) result.push(i);
    }
    return result;
  }

  #is: number[] = [];

  push(op: Op, token: number, depth: number) {
    this.ops.push(op);
    this.depths.push(depth);
    this.tokens.push(token);
    this.#is[depth] = this.parents.push(depth && this.#is[depth - 1]) - 1;
  }

  toString(): string {
    return this.depths.keys().map((id) =>
      "  ".repeat(this.depth(id)) +
      `${this.tokens[id]}: ${Op[this.op(id)]}`
    ).toArray().join("\n");
  }
}
