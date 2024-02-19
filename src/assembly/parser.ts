import { Lexer, Token, TokenType } from "./lexer.ts";

export class ParseError extends Error {
  constructor(readonly token: Token, msg: string) {
    super(msg);
  }
}

export enum NodeType {
  Assignment,
  Block,
  Expression,
  Local,
  Print,
  String,
}

export type LeftExpression = [NodeType.Local, string];

export type RightExpression =
  | [NodeType.String, string]
  | [NodeType.Assignment, LeftExpression, RightExpression]
  | LeftExpression; // todo: not all expressiona can be assigned to!

export type Statement =
  | [NodeType.Expression, RightExpression]
  | [NodeType.Print, RightExpression];

export type Statements = (Statement | [NodeType.Block, Statements])[];

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

  #lhs(): RightExpression {
    switch (this.current.type) {
      case TokenType.STRING: {
        const q = JSON.parse(this.#quote());
        this.#advance();
        return [NodeType.String, q];
      }
      case TokenType.IDENTIFIER: {
        const key: LeftExpression = [NodeType.Local, this.#quote()];
        this.#advance();
        if (this.#match(TokenType.IS)) {
          const value = this.#lhs();
          return [NodeType.Assignment, key, value];
        } else {
          return key;
        }
      }
      default:
        throw this.#error("the token is not allowed at start of an expression");
    }
  }

  #block(): Statements {
    const statements: Statements = [];
    while (!this.#match(TokenType.END)) {
      if (this.#match(TokenType.BRACE_RIGHT)) {
        return statements;
      }
      statements.push(this.#blockOrStatement());
    }
    throw this.#error("missing '}'");
  }

  #statement(): Statement {
    switch (this.current.type) {
      case TokenType.BRACE_LEFT:
        throw this.#error("unexpected '{'");
      case TokenType.PRINT:
        this.#advance();
        return [NodeType.Print, this.#lhs()];
      default:
        return [NodeType.Expression, this.#lhs()];
    }
  }

  #blockOrStatement(): Statement | [NodeType.Block, Statements] {
    if (this.#match(TokenType.BRACE_LEFT)) {
      return [NodeType.Block, this.#block()];
    }
    const s = this.#statement();
    this.#consume(TokenType.SEMICOLON);
    return s;
  }

  script(): Statements {
    const script: Statements = [];
    while (!this.#match(TokenType.END)) {
      script.push(this.#blockOrStatement());
    }
    return script;
  }
}
