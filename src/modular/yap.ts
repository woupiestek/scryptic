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
    const ins = this.#instructions[this.#index--];
    return ins;
  }
  size() {
    return this.#index + 1;
  }
}

class ASTs {
  #tokenIds: number[] = [];
  #childIds: Arrays<number> = new Arrays();

  store(tokenId: number, nodeIds: number[]) {
    const id = this.#childIds.wrap(nodeIds);
    this.#tokenIds[id] = tokenId;
    return id;
  }

  stringify(nodeId: number = this.#tokenIds.length - 1): string {
    const tail = this.#childIds.unwrap(nodeId).map((it) => this.stringify(it));
    return tail.length
      ? `(${this.#tokenIds[nodeId]} ${tail.join(" ")})`
      : this.#tokenIds[nodeId].toString();
  }
}

enum Op {
  Accept,
  ArgsHead,
  ArgsTail,
  Block,
  Else,
  Expect,
  Expr,
  ExprHead,
  ExprTail,
  ReturnValue,
  Semicolon,
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

export class Parser {
  #stack = new Stack();
  #tokenId = 0;
  #openNodeLengths: number[] = [];
  #openNodeTokenIds: number[] = [];
  #closedNodes: number[] = [];
  #asts = new ASTs();

  constructor() {
    this.#stack.push(Op.Stmts, Op.Expect, TokenType.END);
  }

  visitAll(types: TokenType[]) {
    for (const type of types) {
      this.visit(type);
    }
    console.log(this.#closedNodes.map((it) => this.#asts.stringify(it)));
    console.log(this.#closed.map((it) => this.#closedTreeString(it)));
    console.log(this.#open.map((it) => this.#openTreeString(it)));
  }

  visit(type: TokenType) {
    if (type === TokenType.BRACE_LEFT) this.#openNode();
    if (type === TokenType.BRACE_RIGHT) this.#closeNode();
    while (!this.#accept(type));
    this.#tokenId++;
  }

  #error(message: string) {
    return new Error(`@${this.#tokenId}: ${message}`);
  }

  #accept(type: TokenType) {
    if (this.#stack.isEmpty()) {
      throw this.#error("No more tokens can be accepted");
    }

    switch (this.open(this.#stack.pop())) {
      case Op.Accept:
        return type === this.#stack.pop();
      case Op.ExprTail:
        return this.#exprTail(type, this.#stack.pop());
      case Op.Block:
        this.#stack.push(
          Op.Expect,
          TokenType.BRACE_LEFT,
          Op.Stmts,
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
        this.#openNode();
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
          this.#stack.push(Op.Stmts);
          return true;
        }
        throw this.#error(`Expected ";" or "}", received ${TokenType[type]}`);
      case Op.Stmts:
        return this.#statements(type);
      case Op.ArgsHead:
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

  #openNode() {
    this.#openNodeLengths.push(this.#closedNodes.length);
    this.#openNodeTokenIds.push(this.#tokenId);
  }

  #closeNode() {
    const length = this.#openNodeLengths.pop();
    assert(length !== undefined);
    const tokenId = this.#openNodeTokenIds.pop();
    assert(tokenId !== undefined);
    this.#closedNodes[length] = this.#asts.store(
      tokenId,
      this.#closedNodes.slice(length),
    );
    this.#closedNodes.length = length + 1;
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
        this.#stack.push(Op.ArgsHead, Op.ExprTail, precedence);
        return true;
      default:
        this.#closeNode();
        return false;
    }
  }

  #statements(type: TokenType) {
    switch (type) {
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
        return false;
      case TokenType.BRACE_LEFT:
        this.#stack.push(Op.Block, Op.Stmts);
        return false;
      case TokenType.BREAK:
      case TokenType.CONTINUE:
        this.#stack.push(Op.Accept, TokenType.LABEL);
        return true;
      case TokenType.IF:
        this.#stack.push(Op.Expr, 0, Op.Block, Op.Else, Op.Stmts);
        return true;
      case TokenType.LABEL:
        this.#stack.push(
          Op.Expect,
          TokenType.WHILE,
          Op.Expr,
          0,
          Op.Block,
          Op.Stmts,
        );
        return true;
      case TokenType.RETURN:
        this.#stack.push(Op.ReturnValue);
        return true;
      case TokenType.WHILE:
        this.#stack.push(Op.Expr, 0, Op.Block, Op.Stmts);
        return true;
      default:
        this.#stack.push(Op.Expr, 0, Op.Semicolon);
        return false;
    }
  }

  // log details on every instruction
  #arrays = new Arrays<{ op: Op; tokenId: number; children: number }>();
  #open: { op: Op; tokenId: number; size: number; length: number }[] = [];
  #closed: { op: Op; tokenId: number; children: number }[] = [];

  private close() {
    const size = this.#stack.size();
    let i = this.#open.length - 1;
    for (; i > 0 && this.#open[i].size > size; i--) {
      const { op, tokenId, length } = this.#open[i];
      const children = this.#arrays.wrap(this.#closed.slice(length));
      this.#closed.length = length;
      this.#closed.push({ op, tokenId, children });
    }
    this.#open.length = i + 1;
  }

  private open(op: Op) {
    this.close();
    this.#open.push({
      op,
      tokenId: this.#tokenId,
      size: this.#stack.size(),
      length: this.#closed.length,
    });
    return op;
  }

  #openTreeString(
    tree: { op: Op; tokenId: number; size: number; length: number },
  ) {
    return `${Op[tree.op]}@${tree.tokenId}`;
  }

  #closedTreeString(
    tree: { op: Op; tokenId: number; children: number },
  ): string {
    const head = `${Op[tree.op]}@${tree.tokenId}`;
    const tail = this.#arrays.unwrap(tree.children).map((it) =>
      this.#closedTreeString(it)
    );
    return tail.length ? `${head}(${tail.join(", ")})` : head;
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
