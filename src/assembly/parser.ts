import { Lexer, Token, TokenType } from "./lexer.ts";

export class ParseError extends Error {
  constructor(readonly token: Token, msg: string) {
    super(msg);
  }
}

export interface Node {
  readonly token: Token;
}

export class Variable implements Node {
  constructor(readonly token: Token, readonly name: string) {}
}
export type LeftExpression = Variable;

export class LiteralString implements Node {
  constructor(readonly token: Token, readonly value: string) {}
}
export class Assignment implements Node {
  constructor(
    readonly token: Token,
    readonly left: LeftExpression,
    readonly right: RightExpression,
  ) {}
}
export type RightExpression =
  | LiteralString
  | Assignment
  | LeftExpression;

export class PrintStatement implements Node {
  constructor(
    readonly token: Token,
    readonly value: RightExpression,
  ) {}
}

export class VarDeclaration implements Node {
  constructor(
    readonly token: Token,
    readonly key: Variable,
    readonly value?: RightExpression,
  ) {}
}

export type Statement =
  | RightExpression
  | PrintStatement
  | VarDeclaration;

export class Block implements Node {
  constructor(readonly token: Token, readonly statements: Statements) {}
}

export type Statements = (Statement | Block)[];

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

  #rightExpression(): RightExpression {
    switch (this.current.type) {
      case TokenType.STRING: {
        const literal = new LiteralString(
          this.current,
          JSON.parse(this.#quote()),
        );
        this.#advance();
        return literal;
      }
      case TokenType.IDENTIFIER: {
        const key: LeftExpression = new Variable(this.current, this.#quote());
        this.current = this.lexer.next();
        if (this.current.type === TokenType.IS) {
          const token = this.current;
          this.current = this.lexer.next();
          const value = this.#rightExpression();
          return new Assignment(token, key, value);
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
      case TokenType.PRINT: {
        const token = this.current;
        this.#advance();
        return new PrintStatement(token, this.#rightExpression());
      }
      case TokenType.VAR: {
        const token = this.current;
        this.#advance();
        const key = new Variable(this.current, this.#quote());
        this.#consume(TokenType.IDENTIFIER);
        if (this.#match(TokenType.IS)) {
          const value = this.#rightExpression();
          return new VarDeclaration(token, key, value);
        }
        return new VarDeclaration(token, key);
      }
      default:
        return this.#rightExpression();
    }
  }

  #blockOrStatement(): Statement | Block {
    if (this.current.type === TokenType.BRACE_LEFT) {
      const token = this.current;
      this.#advance();
      return new Block(token, this.#block());
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
