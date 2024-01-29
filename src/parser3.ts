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
    const ops = [];
    for (;;) {
      switch (this.current.type) {
        case TokenType.AT:
          ops.push("alpha");
          this.#advance();
          continue;
        case TokenType.BACKSLASH:
          ops.push("lambda");
          this.#advance();
          continue;
        case TokenType.BRACE_LEFT: {
          this.#advance();
          const term = this.term();
          this.#consume(TokenType.BRACE_RIGHT);
          return term;
        }
        case TokenType.DOLLAR:
          ops.push("kappa");
          this.#advance();
          continue;
        case TokenType.IDENTIFIER: {
          let term: Term = ["ident", this.#quote()];
          while (ops.length > 0) {
            term = [ops.pop() as "alpha" | "kappa" | "lambda", term];
          }
          this.#advance();
          return term;
        }
        default:
          throw this.#error("unexpected token");
      }
    }
  }

  term(): Term {
    let term = this.#term0();
    while (this.#match(TokenType.COMMA)) {
      const key = this.#quote();
      this.#consume(TokenType.IDENTIFIER);
      this.#consume(TokenType.IS);
      term = ["where", term, key, this.#term0()];
    }
    return term;
  }
}

export function stringifyTerm(term: Term, level = 1): string {
  switch (term[0]) {
    case "ident":
      return term[1];
    case "where": {
      const s = `${stringifyTerm(term[1], 0)}, ${term[2]} = ${
        stringifyTerm(term[3], 0)
      }`;
      return level < 1 ? `{${s}}` : s;
    }
    case "lambda":
      return `\\${stringifyTerm(term[1], 0)}`;
    case "alpha":
      return `@${stringifyTerm(term[1], 0)}`;
    case "kappa":
      return `$${stringifyTerm(term[1], 0)}`;
  }
}
