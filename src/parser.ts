import { Term } from "./model.ts";
import { Lexer, Token, TokenType } from "./lexer.ts";

export class ParseError extends Error {
  constructor(readonly token: Token, msg: string) {
    super(msg);
  }
}

export class Parser {
  private current: Token;
  private lexer: Lexer;
  constructor(private input: string) {
    this.lexer = new Lexer(input);
    this.current = this.lexer.next();
  }

  #advance() {
    this.current = this.lexer.next();
  }

  #quote() {
    return this.input.substring(this.current.from, this.current.to);
  }

  #error(msg: string) {
    return new ParseError(
      this.current,
      `Error at line ${this.current.line}, column ${this.current.column}, token ${
        TokenType[this.current.type]
      } "${this.#quote()}": ${msg}`,
    );
  }

  #consume(type: TokenType) {
    if (!this.#match(type)) {
      throw this.#error(
        `expected ${TokenType[type]}, found ${TokenType[this.current.type]}`,
      );
    }
  }

  #match(type: TokenType) {
    if (this.current.type === type) {
      this.#advance();
      return true;
    }
    return false;
  }

  #term0(): Term {
    let term: Term;
    switch (this.current.type) {
      case TokenType.BRACE_LEFT: {
        this.current = this.lexer.next();
        term = this.term();
        this.#consume(TokenType.BRACE_RIGHT);
        break;
      }
      case TokenType.IDENTIFIER:
        term = ["ident", this.#quote()];
        this.current = this.lexer.next();
        break;
      default:
        throw this.#error(`unexpected token`);
    }
    return term;
  }

  #term1(): Term {
    switch (this.current.type) {
      case TokenType.BACKSLASH: {
        this.#advance();
        return ["lambda", this.#term1()];
      }
      case TokenType.DOLLAR:
        this.#advance();
        return ["kappa", this.#term1()];
      default:
        return this.#term0();
    }
  }

  #term2(): Term {
    if (this.current.type === TokenType.IDENTIFIER) {
      const key = this.#quote();
      this.current = this.lexer.next();
      if (this.current.type === TokenType.IS) {
        this.#advance();
        const value = this.#term1();
        this.#consume(TokenType.COMMA);
        return ["where", this.#term2(), key, value];
      } else {
        return ["ident", key];
      }
    } else {
      return this.#term1();
    }
  }

  term(): Term {
    let term = this.#term2();
    while (this.#match(TokenType.DOT)) {
      term = ["alpha", term];
    }
    return term;
  }
}
