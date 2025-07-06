import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Lex, TokenType } from "./lex.ts";

enum NodeType {
  BLOCK,
  CLASS,
  CONTROL,
  EXPR,
  EXPR_HEAD,
  EXPR_TAIL,
  IDENTIFIER,
  JUMP,
  METHOD,
  RETURN,
  STMT,
}

export class Parse {
  types: number[] = [];
  token: number[] = [];
  // record the number of nodes in each sub tree... hopefully.
  sizes: number[] = [];
  private next = 0;
  private size = 0;

  #opened: number[] = [];

  #open(type: NodeType, token: number) {
    this.token[this.size] = token;
    this.types[this.size] = type;
    this.sizes[this.size] = -this.size;
    this.#opened.push(this.size++);
  }

  #close() {
    const i = this.#opened.pop();
    assert(i !== undefined);
    this.sizes[i] += this.size;
  }

  constructor(private lex: Lex) {
    while (!this.#match(TokenType.END)) {
      if (this.#top() === TokenType.CLASS) {
        this.#class();
      } else {
        this.#stmt();
      }
    }
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
    const [l, c] = this.lex.lineAndColumn(this.next);
    throw new Error(
      `Expected ${TokenType[type]}, found ${
        TokenType[this.#top()]
      } at (${l},${c})`,
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
        this.#expr();
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
        this.#expr();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        this.#close();
        break;
      case TokenType.RETURN:
        this.#open(NodeType.JUMP, this.next - 1);
        if (this.#top() !== TokenType.BRACE_RIGHT) {
          this.#expr();
        }
        this.#close();
        break;
      case TokenType.WHILE:
        this.#open(NodeType.CONTROL, this.next - 1);
        this.#expr();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        this.#close();
        break;
      default:
        // back up!
        this.next--;
        this.#expr();
        if (
          this.#top() !== TokenType.BRACE_RIGHT && this.#top() !== TokenType.END
        ) {
          this.#consume(TokenType.SEMICOLON);
        }
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

  #identifier() {
    this.#open(NodeType.IDENTIFIER, this.next);
    this.#consume(TokenType.IDENTIFIER);
    this.#close();
  }

  #exprHead() {
    this.#open(NodeType.EXPR_HEAD, this.next);
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
        this.#exprHead();
        break;
      case TokenType.VAR:
        this.#identifier();
        break;
      case TokenType.PAREN_LEFT:
        this.#expr();
        this.#consume(TokenType.PAREN_RIGHT);
    }
    this.#close();
  }

  #exprTail() {
    this.#open(NodeType.EXPR_TAIL, this.next);
    for (;;) {
      switch (this.#top()) {
        case TokenType.AND:
        case TokenType.BE:
        case TokenType.IS_NOT:
        case TokenType.IS:
        case TokenType.LESS:
        case TokenType.MORE:
        case TokenType.NOT_LESS:
        case TokenType.NOT_MORE:
        case TokenType.OR:
          this.next++;
          this.#expr();
          continue;
        case TokenType.DOT:
          this.next++;
          this.#identifier();
          continue;
        case TokenType.PAREN_LEFT:
          this.next++;
          if (this.#match(TokenType.PAREN_RIGHT)) {
            continue;
          }
          this.#expr();
          while (this.#match(TokenType.COMMA)) {
            this.#expr();
          }
          this.#consume(TokenType.PAREN_RIGHT);
          continue;
        default:
          this.#close();
          return;
      }
    }
  }

  // skip the precedence part for now
  #expr() {
    this.#open(NodeType.EXPR, this.next);
    this.#exprHead();
    this.#exprTail();
    this.#close();
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

  #method() {
    if (this.#top() !== TokenType.IDENTIFIER && this.#top() !== TokenType.NEW) {
      const [l, c] = this.lex.lineAndColumn(this.next);
      throw new Error(
        `Expected method, found ${TokenType[this.#top()]} at (${l},${c})`,
      );
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
}
