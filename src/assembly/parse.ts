import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Lex, TokenType } from "./lex.ts";

export enum NodeType {
  BLOCK,
  CALL,
  CLASS,
  CONTROL,
  PREFIX,
  INFIX,
  EXPR,
  JUMP,
  METHOD,
  RETURN,
  STMT,
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
PRECEDENCE_A[TokenType.PAREN_LEFT] = 4;

const PRECEDENCE_B: number[] = [...PRECEDENCE_A];
PRECEDENCE_B[TokenType.BE] = 0;
PRECEDENCE_B[TokenType.PAREN_LEFT] = 3;

type Expr = {
  tokens: number[];
  sizes: number[];
};

export class Parse {
  types: number[] = [];
  tokens: number[] = [];
  // record the number of nodes in each sub tree... hopefully.
  sizes: number[] = [];
  private next = 0;
  size = 0;

  #opened: number[] = [];

  #open(type: NodeType, token: number) {
    this.tokens[this.size] = token;
    this.types[this.size] = type;
    this.sizes[this.size] = -this.size;
    this.#opened.push(this.size++);
  }

  #close(type?: NodeType) {
    const i = this.#opened.pop();
    assert(i !== undefined);
    if (type !== undefined) assert(this.types[i] === type, NodeType[type]);
    this.sizes[i] += this.size;
  }

  constructor(readonly lex: Lex) {
    while (!this.#match(TokenType.END)) {
      if (this.#top() === TokenType.CLASS) {
        this.#class();
      } else {
        this.#stmt();
      }
    }
    assert(this.#opened.length === 0, "" + this.#opened.length);
  }

  #top() {
    return this.lex.types[this.next];
  }

  #pop() {
    return this.lex.types[this.next++];
  }

  #match(type: TokenType) {
    if (this.#top() === type) {
      this.next++;
      return true;
    }
    return false;
  }

  #consume(type: TokenType) {
    if (this.#match(type)) return;
    throw this.#error(
      `expected ${TokenType[type]}, found ${TokenType[this.#top()]}`,
    );
  }

  #stmt() {
    this.#open(NodeType.STMT, this.next);
    switch (this.#pop()) {
      case TokenType.BRACE_LEFT:
        this.#block();
        break;
      case TokenType.BREAK:
      case TokenType.CONTINUE:
        this.#open(NodeType.JUMP, this.next - 1);
        this.#match(TokenType.LABEL);
        this.#close();
        break;
      case TokenType.IF:
        this.#open(NodeType.CONTROL, this.next - 1);
        this.#exprRoot();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        if (this.#match(TokenType.ELSE)) {
          this.#consume(TokenType.BRACE_LEFT);
          this.#block();
        }
        this.#close();
        break;
      case TokenType.LABEL:
        this.#open(NodeType.CONTROL, this.next - 1);
        this.#consume(TokenType.WHILE);
        this.#exprRoot();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        this.#close();
        break;
      case TokenType.RETURN:
        this.#open(NodeType.JUMP, this.next - 1);
        if (this.#top() !== TokenType.BRACE_RIGHT) {
          this.#exprRoot();
        }
        this.#close();
        break;
      case TokenType.WHILE:
        this.#open(NodeType.CONTROL, this.next - 1);
        this.#exprRoot();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        this.#close();
        break;
      default:
        // back up!
        this.next--;
        this.#exprRoot();
        if (
          this.#top() !== TokenType.BRACE_RIGHT && this.#top() !== TokenType.END
        ) {
          this.#consume(TokenType.SEMICOLON);
        }
        break;
    }
    this.#close();
  }

  #block() {
    this.#open(NodeType.BLOCK, this.next - 1);
    while (this.#top() !== TokenType.BRACE_RIGHT) {
      this.#stmt();
    }
    this.#consume(TokenType.BRACE_RIGHT);
    this.#close();
  }

  // I need something better

  #identifier() {
    this.#open(NodeType.PREFIX, this.next);
    this.#consume(TokenType.IDENTIFIER);
    this.#close();
  }

  #prefix() {
    this.#open(NodeType.PREFIX, this.next);
    switch (this.#pop()) {
      case TokenType.FALSE:
      case TokenType.IDENTIFIER:
      case TokenType.STRING:
      case TokenType.THIS:
      case TokenType.TRUE:
        break;
      case TokenType.LOG:
      case TokenType.NOT:
      case TokenType.NEW:
        this.#prefix();
        break;
      case TokenType.VAR:
        this.#identifier();
        break;
      case TokenType.PAREN_LEFT:
        this.#expr(0);
        this.#consume(TokenType.PAREN_RIGHT);
        break;
      default:
        throw this.#error("expression expected");
    }
    this.#close();
  }

  #exprRoot() {
    this.#open(NodeType.EXPR, this.next);
    this.#expr(0);
    this.#close(NodeType.EXPR);
  }

  #expr(precedence: number) {
    this.#prefix();
    for (;;) {
      const bin = this.#pop();
      switch (bin) {
        case TokenType.AND:
        case TokenType.BE:
        case TokenType.IS_NOT:
        case TokenType.IS:
        case TokenType.LESS:
        case TokenType.MORE:
        case TokenType.NOT_LESS:
        case TokenType.NOT_MORE:
        case TokenType.OR:
          if (PRECEDENCE_A[bin] > precedence) {
            this.#open(NodeType.INFIX, this.next - 1);
            this.#expr(PRECEDENCE_B[bin]);
            this.#close();
            continue;
          }
          break;
        case TokenType.DOT:
          this.#open(NodeType.INFIX, this.next - 1);
          this.#identifier();
          this.#close();
          continue;
        case TokenType.PAREN_LEFT:
          this.#open(NodeType.CALL, this.next - 1);
          if (!this.#match(TokenType.PAREN_RIGHT)) {
            do this.#expr(0); while (this.#match(TokenType.COMMA));
            this.#consume(TokenType.PAREN_RIGHT);
          }
          this.#close();
          continue;
        default:
          break;
      }
      this.next--;
      break;
    }
    return;
  }

  #class() {
    this.#open(NodeType.CLASS, this.next++);
    this.#identifier();
    this.#consume(TokenType.BRACE_LEFT);
    while (!this.#match(TokenType.BRACE_RIGHT)) {
      this.#method();
    }
    this.#close();
  }

  #error(msg: string) {
    const [l, c] = this.lex.lineAndColumn(this.next);
    return new Error(
      `Error: '${msg}' at (${l},${c})`,
    );
  }

  #method() {
    if (this.#top() !== TokenType.IDENTIFIER && this.#top() !== TokenType.NEW) {
      throw this.#error(`expected method, found ${TokenType[this.#top()]}`);
    }
    this.#open(NodeType.METHOD, this.next++);
    // args lists
    this.#consume(TokenType.PAREN_LEFT);
    if (!this.#match(TokenType.PAREN_RIGHT)) {
      do this.#identifier(); while (this.#match(TokenType.COMMA));
      this.#consume(TokenType.PAREN_RIGHT);
    }
    this.#consume(TokenType.BRACE_LEFT);
    this.#block();
    this.#close();
  }

  toString() {
    const depths: number[] = new Array(this.size).keys().map(() => 0).toArray();
    for (let i = 0; i < this.size; i++) {
      for (let j = 1; j < this.sizes[i]; j++) {
        depths[i + j]++;
      }
    }
    const lines: string[] = [];
    const l = this.size.toString().length;
    for (let i = 0; i < this.size; i++) {
      lines.push(
        (" ".repeat(l - 1) + i).slice(-l) + ": " +
          "  ".repeat(depths[i]) +
          `${this.lex.indices[this.tokens[i]]}:${
            TokenType[this.lex.types[this.tokens[i]]]
          }:${NodeType[this.types[i]]}`,
      );
    }
    return lines.join("\n");
  }
}
