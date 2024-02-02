import { Lexer, Token, TokenType } from "./lexer.ts";

export type Term =
  | [0, string]
  | [1, ("A" | "K" | "L")[], Term]
  | [2, Term, [string, Term][]];

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
    const ops: ("A" | "K" | "L")[] = [];
    for (;;) {
      switch (this.current.type) {
        case TokenType.AT:
          ops.push("A");
          this.#advance();
          continue;
        case TokenType.BACKSLASH:
          ops.push("L");
          this.#advance();
          continue;
        case TokenType.BRACE_LEFT: {
          this.#advance();
          const term = this.term();
          this.#consume(TokenType.BRACE_RIGHT);
          return term;
        }
        case TokenType.DOLLAR:
          ops.push("K");
          this.#advance();
          continue;
        case TokenType.IDENTIFIER: {
          let term: Term = [0, this.#quote()];
          if (ops.length > 0) term = [1, ops, term];
          this.#advance();
          return term;
        }
        default:
          throw this.#error("unexpected token");
      }
    }
  }

  term(): Term {
    const term = this.#term0();
    const pairs: [string, Term][] = [];
    while (this.#match(TokenType.COMMA)) {
      const key = this.#quote();
      this.#consume(TokenType.IDENTIFIER);
      this.#consume(TokenType.IS);
      pairs.push([key, this.#term0()]);
    }
    if (pairs.length > 0) return [2, term, pairs];
    return term;
  }
}

export function stringifyTerm(term: Term, level = 1): string {
  switch (term[0]) {
    case 0:
      return term[1];
    case 2: {
      const s = `${stringifyTerm(term[1], 0)}, ${
        term[2].map(([k, v]) => `${k} = ${stringifyTerm(v, 0)}`).join(", ")
      }`;
      return level < 1 ? `{${s}}` : s;
    }
    case 1:
      return `${
        term[1].map((it) => ({ A: "@", K: "$", L: "\\", W: "&" }[it])).join("")
      }${stringifyTerm(term[2], 0)}`;
  }
}
