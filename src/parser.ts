import { Term } from "./model.ts";
import { Lexer, TokenType } from "./lexer.ts";

export class ParseError extends Error {
  constructor(readonly token: number, msg: string) {
    super(msg);
  }
}

export class Parser {
  private current = 0;
  private lexer: Lexer;
  sizes: number[] = [];
  constructor(private input: string) {
    this.lexer = new Lexer(input);
  }

  #advance() {
    this.current++;
  }

  #quote() {
    return this.lexer.lexeme(this.current);
  }

  #type() {
    return this.lexer.types[this.current];
  }

  #error(msg: string) {
    const { line, column } = this.lexer.lineAndColumn(this.current);
    return new ParseError(
      this.current,
      `Error at line ${line}, column ${column}, token ${
        TokenType[this.#type()]
      } "${this.#quote()}": ${msg}`,
    );
  }

  #consume(type: TokenType) {
    if (!this.#match(type)) {
      throw this.#error(
        `expected ${TokenType[type]}, found ${TokenType[this.#type()]}`,
      );
    }
  }

  #match(type: TokenType) {
    if (this.#type() === type) {
      this.#advance();
      return true;
    }
    return false;
  }

  #term0(): Term {
    let term: Term;
    switch (this.#type()) {
      case TokenType.BRACE_LEFT: {
        this.current++;
        term = this.term();
        this.#consume(TokenType.BRACE_RIGHT);
        break;
      }
      case TokenType.IDENTIFIER:
        term = ["ident", this.#quote()];
        this.current++;
        break;
      default:
        throw this.#error(`unexpected token`);
    }
    return term;
  }

  #term1(): Term {
    switch (this.#type()) {
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
    if (this.#type() === TokenType.IDENTIFIER) {
      const key = this.#quote();
      this.current++;
      if (this.#type() === TokenType.IS) {
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
