import { Lexer, Token, TokenType } from "./lexer.ts";

export class ParseError extends Error {
  constructor(readonly token: Token, msg: string) {
    super(msg);
  }
}

export type Expression = ["string", string];
export type Statement =
  | ["print", Expression]
  | ["block", Statement[]]
  | ["expression", Expression];

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

  #expression(): Expression {
    switch (this.current.type) {
      case TokenType.STRING: {
        const q = this.#quote();
        this.#advance();
        return ["string", q];
      }
      default:
        throw this.#error("the token is not allowed at start of an expression");
    }
  }

  #block(): Statement {
    const statements = [];
    while (!this.#match(TokenType.END)) {
      if (this.#match(TokenType.BRACE_RIGHT)) {
        this.#advance();
        return ["block", statements];
      }
      statements.push(this.#statement());
      this.#consume(TokenType.SEMICOLON);
    }
    throw this.#error("missing '}'");
  }

  #statement(): Statement {
    switch (this.current.type) {
      case TokenType.BRACE_LEFT:
        return this.#block();
      case TokenType.PRINT:
        this.#advance();
        return ["print", this.#expression()];
      default:
        return ["expression", this.#expression()];
    }
  }

  script(): Statement[] {
    const script = [];
    while (!this.#match(TokenType.END)) {
      script.push(this.#statement());
      this.#consume(TokenType.SEMICOLON);
    }
    return script;
  }
}
