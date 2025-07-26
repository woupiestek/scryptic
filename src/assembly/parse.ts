import { Lex, TokenType } from "./lex.ts";

export enum NodeType {
  BLOCK,
  CLASS,
  CONTROL,
  EXPR,
  JUMP,
  LABEL,
  METHOD,
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

export class Parse {
  types: number[] = [];
  tokens: number[] = [];
  sizes: number[] = [];
  private next = 0;
  size = 0;

  #close(type: NodeType, token: number, start: number) {
    this.tokens[this.size] = token;
    this.types[this.size] = type;
    this.sizes[this.size] = this.size - start + 1;
    this.size++;
  }

  constructor(readonly lex: Lex) {
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
    throw this.#error(
      `expected ${TokenType[type]}, found ${TokenType[this.#top()]}`,
    );
  }

  #stmt() {
    const start = this.size;
    let token = this.next;
    switch (this.#pop()) {
      case TokenType.BRACE_LEFT:
        this.#block();
        break;
      case TokenType.BREAK:
      case TokenType.CONTINUE:
        if (this.#match(TokenType.LABEL)) {
          this.#close(NodeType.LABEL, token + 1, start);
        }
        this.#close(NodeType.JUMP, token, start);
        break;
      case TokenType.IF:
        this.#exprRoot();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        if (this.#match(TokenType.ELSE)) {
          this.#consume(TokenType.BRACE_LEFT);
          this.#block();
        }
        this.#close(NodeType.CONTROL, token, start);
        break;
      case TokenType.LABEL:
        this.#close(NodeType.LABEL, token, start);
        token = this.next; // what happens to the label now?
        this.#consume(TokenType.WHILE);
        this.#exprRoot();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        this.#close(NodeType.CONTROL, token, start);
        break;
      case TokenType.RETURN:
        if (this.#top() !== TokenType.BRACE_RIGHT) {
          this.#exprRoot();
        }
        this.#close(NodeType.JUMP, token, start);
        break;
      case TokenType.WHILE:
        this.#exprRoot();
        this.#consume(TokenType.BRACE_LEFT);
        this.#block();
        this.#close(NodeType.CONTROL, token, start);
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
  }

  #block() {
    const start = this.size;
    const token = this.next - 1;
    while (this.#top() !== TokenType.BRACE_RIGHT) {
      this.#stmt();
    }
    this.#consume(TokenType.BRACE_RIGHT);
    this.#close(NodeType.BLOCK, token, start);
  }

  #identifier() {
    const start = this.size;
    const token = this.next;
    this.#consume(TokenType.IDENTIFIER);
    this.#close(NodeType.EXPR, token, start);
  }

  #prefix() {
    const start = this.size;
    const token = this.next;
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
        // avoid creating a node for this one.
        return;
      default:
        throw this.#error("expression expected");
    }
    this.#close(NodeType.EXPR, token, start);
    return;
  }

  #exprRoot() {
    this.#expr(0);
  }

  #expr(precedence: number) {
    const start = this.size;
    this.#prefix();
    for (;;) {
      const bin = this.#top();
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
          if (PRECEDENCE_A[bin] >= precedence) {
            const token = this.next++;
            this.#expr(PRECEDENCE_B[bin]);
            this.#close(NodeType.EXPR, token, start);
            continue;
          }
          return;
        case TokenType.DOT: {
          const token = this.next++;
          this.#identifier();
          this.#close(NodeType.EXPR, token, start);
          continue;
        }
        case TokenType.PAREN_LEFT: {
          const token = this.next++;
          if (!this.#match(TokenType.PAREN_RIGHT)) {
            do this.#expr(0); while (this.#match(TokenType.COMMA));
            this.#consume(TokenType.PAREN_RIGHT);
          }
          this.#close(NodeType.EXPR, token, start);
          continue;
        }
        default:
          return;
      }
    }
  }

  #class() {
    const start = this.size;
    const token = this.next++;
    this.#identifier();
    this.#consume(TokenType.BRACE_LEFT);
    while (!this.#match(TokenType.BRACE_RIGHT)) {
      this.#method();
    }
    this.#close(NodeType.CLASS, token, start);
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
    const start = this.size;
    const token = this.next++;
    // args lists
    this.#consume(TokenType.PAREN_LEFT);
    if (!this.#match(TokenType.PAREN_RIGHT)) {
      do this.#identifier(); while (this.#match(TokenType.COMMA));
      this.#consume(TokenType.PAREN_RIGHT);
    }
    this.#consume(TokenType.BRACE_LEFT);
    this.#block();
    this.#close(NodeType.METHOD, token, start);
  }

  // in reverses order, ideal for pop, though...
  children(node: number = this.size): number[] {
    const result: number[] = [];
    for (
      let i = node - 1, i0 = node - (this.sizes[node] ?? node);
      i > i0;
      i -= this.sizes[i]
    ) {
      result.push(i);
    }
    result.reverse();
    return result;
  }

  toString() {
    const depths: number[] = new Array(this.size).keys().map(() => 0).toArray();
    for (let i = 0; i < this.size; i++) {
      for (let j = 1; j < this.sizes[i]; j++) {
        depths[i - j]++;
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
