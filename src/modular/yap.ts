import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { TokenType } from "./lexer.ts";

class Stack {
  #index = -1;
  #instructions: number[] = [];
  isEmpty() {
    return this.#index < 0;
  }
  push(...instructions: number[]) {
    for (
      let instruction = instructions.pop();
      instruction !== undefined;
      instruction = instructions.pop()
    ) {
      this.#instructions[++this.#index] = instruction;
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

enum Op {
  Accept,
  Args,
  ArgsTail,
  Block,
  BlockEnd,
  Else,
  Expect,
  Expr,
  ExprHead,
  ExprTail,
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

type Frame = { op: Op; tokenId: number; children: number };

export class Parser {
  #stack = new Stack();
  #tokenId = 0;

  constructor() {
    this.#pushFrame(Op.Stmt);
    this.#stack.push(Op.Stmts, Op.Expect, TokenType.END);
  }

  visitAll(types: TokenType[]) {
    for (const type of types) {
      this.visit(type);
    }
    assert(this.#stack.size() === 0);

    for (const ast of this.asts()) {
      console.log(ast.stringify());
    }
  }

  visit(type: TokenType) {
    while (!this.#accept(type));
    this.#tokenId++;
  }

  #error(message: string) {
    return new Error(`@${this.#tokenId}: ${message}`);
  }

  #accept(type: TokenType) {
    this.#popFrames();
    switch (this.#pushFrame(this.#stack.pop())) {
      case Op.Accept:
        return type === this.#stack.pop();
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
            this.#stack.push(Op.Accept, TokenType.LABEL);
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
        this.#stack.push(Op.Expect, TokenType.IDENTIFIER);
        return true;
      case TokenType.PAREN_LEFT:
        this.#stack.push(Op.Expr, 0, Op.Expect, TokenType.PAREN_RIGHT);
        return true;
      default:
        this.#error("Expression expected");
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
          Op.Expect,
          TokenType.IDENTIFIER,
          Op.ExprTail,
          precedence,
        );
        return true;
      case TokenType.PAREN_LEFT:
        this.#stack.push(Op.Args, Op.ExprTail, precedence);
        return true;
      default:
        return false;
    }
  }

  #statement(type: TokenType) {
    switch (type) {
      case TokenType.BRACE_RIGHT:
      case TokenType.BREAK:
      case TokenType.CONTINUE:
      case TokenType.END:
      case TokenType.RETURN:
        // empty statement allowed
        return false;
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

  // log details on every instruction
  #arrays = new Arrays<Frame>();
  #open: { op: Op; tokenId: number; size: number; length: number }[] = [];
  #closed: Frame[] = [];

  *asts() {
    for (const frame of this.#closed) {
      yield new AST(frame, this.#arrays);
    }
  }

  #popFrames() {
    const size = this.#stack.size();
    let i = this.#open.length - 1;
    for (; i > 0 && this.#open[i].size >= size; i--) {
      const { op, tokenId, length } = this.#open[i];
      const children = this.#arrays.wrap(this.#closed.slice(length));
      this.#closed.length = length;
      this.#closed.push({ op, tokenId, children });
    }
    this.#open.length = i + 1;
  }

  #pushFrame(op: Op) {
    if (op === Op.Stmts) return op;
    this.#open.push({
      op,
      tokenId: this.#tokenId,
      size: this.#stack.size(),
      length: this.#closed.length,
    });
    return op;
  }
}

class AST {
  readonly op;
  readonly tokenId;
  #children;
  constructor(frame: Frame, private arrays: Arrays<Frame>) {
    this.op = frame.op;
    this.tokenId = frame.tokenId;
    this.#children = frame.children;
  }
  *children() {
    for (const frame of this.arrays.unwrap(this.#children)) {
      yield new AST(frame, this.arrays);
    }
  }
  stringify(): string {
    const tag = Op[this.op];
    const head = `${tag} tokenId="${this.tokenId}"`;
    const tail = [...this.children()].map((it) => it.stringify());
    return tail.length ? `<${head}>${tail.join("")}</${tag}>` : `<${head}/>`;
  }
}

class Arrays<A> {
  #entries: A[] = [];
  #children: number[] = [];
  wrap(trees: A[]) {
    this.#entries.push(...trees);
    return this.#children.push(this.#entries.length) - 1;
  }
  unwrap(id: number) {
    return this.#entries.slice(
      id && this.#children[id - 1],
      this.#children[id],
    );
  }
  length(id: number) {
    return this.#children[id] - (id && this.#children[id - 1]);
  }
}
