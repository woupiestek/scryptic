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
export class MemberAccess implements Node {
  constructor(
    readonly token: Token,
    readonly target: LeftExpression,
    readonly member: string,
  ) {}
}
export type LeftExpression = Variable | MemberAccess;

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

export class New implements Node {
  constructor(readonly token: Token) {}
}
export type RightExpression =
  | Assignment
  | LiteralString
  | LeftExpression
  | New;

// print x = 7; is now interpreted as print (x = 7) and allowed. It is an interpretation that makes sence...
export class LogStatement implements Node {
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
  | Block
  | RightExpression
  | LogStatement
  | VarDeclaration;

export class Block implements Node {
  constructor(readonly token: Token, readonly statements: Statement[]) {}
}

export class Parser {
  private next: Token;
  private lexer: Lexer;
  constructor(private input: string) {
    this.lexer = new Lexer(input);
    this.next = this.lexer.next();
  }

  #pop() {
    const token = this.next;
    this.next = this.lexer.next();
    return token;
  }

  lexeme(token: Token) {
    return this.input.substring(token.from, token.to);
  }

  #error(token: Token, msg: string) {
    return new ParseError(
      token,
      `Error at line ${token.line}, column ${token.column}, token ${
        TokenType[token.type]
      } "${this.lexeme(token)}": ${msg}`,
    );
  }

  #consume(type: TokenType) {
    const token = this.#pop();
    if (token.type !== type) {
      throw this.#error(token, `expected ${TokenType[type]}`);
    }
    return token;
  }

  #match(type: TokenType) {
    if (this.next.type === type) {
      this.next = this.lexer.next();
      return true;
    }
    return false;
  }

  #expression(token: Token): RightExpression {
    switch (token.type) {
      case TokenType.STRING: {
        return new LiteralString(
          token,
          JSON.parse(this.lexeme(token)),
        );
      }
      case TokenType.NEW: {
        return new New(token);
      }
      case TokenType.IDENTIFIER: {
        let key: LeftExpression = new Variable(token, this.lexeme(token));
        // for new, allow no member access to literal strings or to new, as either are pointless
        // this could change, though
        while (this.next.type === TokenType.DOT) {
          const dot = this.#pop();
          const member = this.#consume(TokenType.IDENTIFIER);
          key = new MemberAccess(dot, key, this.lexeme(member));
        }
        if (this.next.type === TokenType.IS) {
          const is = this.#pop();
          const value = this.#expression(this.#pop());
          return new Assignment(is, key, value);
        } else {
          return key;
        }
      }
      default:
        throw this.#error(
          token,
          "the token is not allowed at start of an expression",
        );
    }
  }

  #block(braceLeft: Token): Block {
    const statements: Statement[] = [];
    while (!this.#match(TokenType.END)) {
      if (this.#match(TokenType.BRACE_RIGHT)) {
        return new Block(braceLeft, statements);
      }
      statements.push(this.#statement());
    }
    throw this.#error(
      braceLeft,
      `'{' at [${braceLeft.line}, ${braceLeft.column}] is missing a '}'`,
    );
  }

  #statement(): Statement {
    const token = this.#pop();
    let statement: Statement;
    switch (token.type) {
      case TokenType.BRACE_LEFT:
        return this.#block(token);
      case TokenType.LOG: {
        statement = new LogStatement(token, this.#expression(this.#pop()));
        break;
      }
      case TokenType.VAR: {
        const variable = this.#consume(TokenType.IDENTIFIER);
        const key = new Variable(variable, this.lexeme(variable));
        if (this.#match(TokenType.IS)) {
          const value = this.#expression(this.#pop());
          statement = new VarDeclaration(token, key, value);
          break;
        }
        statement = new VarDeclaration(token, key);
        break;
      }
      default:
        statement = this.#expression(token);
        break;
    }
    this.#consume(TokenType.SEMICOLON);
    return statement;
  }

  script(): Statement[] {
    const script: Statement[] = [];
    while (!this.#match(TokenType.END)) {
      script.push(this.#statement());
    }
    return script;
  }
}
