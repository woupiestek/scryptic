import { Lexer, Token, TokenType } from "./lexer.ts";

export class ParseError extends Error {
  constructor(readonly token: Token, msg: string) {
    super(msg);
  }
}

export interface Node {
  readonly token: Token;
}

export class Break {
  constructor(readonly token: Token, readonly label?: string) {}
}

export class Continue {
  constructor(readonly token: Token, readonly label?: string) {}
}

export class LiteralString implements Node {
  constructor(readonly token: Token, readonly value: string) {}
}

export class New implements Node {
  constructor(readonly token: Token) {}
}
export class IfStatement implements Node {
  constructor(
    readonly token: Token,
    readonly condition: Expression,
    readonly onTrue: Block,
    readonly onFalse?: Block,
  ) {}
}

export class WhileStatement implements Node {
  constructor(
    readonly token: Token,
    readonly condition: Expression,
    readonly onTrue: Block,
    readonly label?: string,
  ) {}
}

// log x = 7; is now interpreted as print (x = 7) and allowed. It is an interpretation that makes sence...
// consider having log expressions instead...
export class LogStatement implements Node {
  constructor(
    readonly token: Token,
    readonly value: Expression,
  ) {}
}

export class VarDeclaration implements Node {
  constructor(
    readonly token: Token,
    readonly key: Variable,
    readonly value?: Expression,
  ) {}
}

export type Statement =
  | Block
  | Expression
  | IfStatement
  | LogStatement
  | VarDeclaration
  | WhileStatement;

export class Block implements Node {
  constructor(readonly token: Token, readonly statements: Statement[]) {}
}

export class MemberAccess implements Node {
  constructor(
    readonly token: Token,
    readonly object: Variable | MemberAccess,
    readonly field: string,
  ) {}
}

export class Binary implements Node {
  constructor(
    readonly token: Token,
    readonly left: Expression,
    readonly right: Expression,
  ) {}
}

export class LiteralBoolean implements Node {
  constructor(
    readonly token: Token,
    readonly value: boolean,
  ) {}
}

export class Not implements Node {
  constructor(
    readonly token: Token,
    readonly count: number,
    readonly expression: Expression,
  ) {}
}

export class Variable implements Node {
  constructor(
    readonly token: Token,
    readonly name: string,
  ) {}
}

export type Expression =
  | MemberAccess
  | Binary
  | LiteralBoolean
  | LiteralString
  | New
  | Not
  | Variable;

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

  #unary(head: Token): Expression {
    const head0 = head;
    let count = 0;
    while (head.type === TokenType.NOT) {
      count++;
      head = this.#pop();
    }
    let expression: Expression;
    switch (head.type) {
      case TokenType.PAREN_LEFT: {
        expression = this.#expression(this.#pop());
        this.#consume(TokenType.PAREN_RIGHT);
        break;
      }
      case TokenType.IDENTIFIER: {
        expression = new Variable(head, this.lexeme(head));
        break;
      }
      case TokenType.FALSE: {
        expression = new LiteralBoolean(head, false);
        break;
      }
      case TokenType.TRUE: {
        expression = new LiteralBoolean(head, true);
        break;
      }
      case TokenType.STRING: {
        expression = new LiteralString(
          head,
          JSON.parse(this.lexeme(head)),
        );
        break;
      }
      case TokenType.NEW: {
        expression = new New(head);
        break;
      }
      default:
        throw this.#error(head, "Expected expression");
    }
    while (this.next.type === TokenType.DOT) {
      if (
        expression instanceof Variable || expression instanceof MemberAccess
      ) {
        const token = this.#pop();
        const name = this.lexeme(this.#consume(TokenType.IDENTIFIER));
        expression = new MemberAccess(token, expression, name);
      } else {
        throw this.#error(this.next, "Unexpected member access");
      }
    }
    return count > 0 ? new Not(head0, count, expression) : expression;
  }

  static TABLE = (() => {
    const table = [];
    table[TokenType.AND] = [2, 2];
    table[TokenType.BE] = [1, 0];
    table[TokenType.IS] = [3, 3];
    table[TokenType.IS_NOT] = [3, 3];
    table[TokenType.LESS] = [3, 3];
    table[TokenType.MORE] = [3, 3];
    table[TokenType.NOT_LESS] = [3, 3];
    table[TokenType.NOT_MORE] = [3, 3];
    table[TokenType.OR] = [2, 2];
    return table;
  })();

  #binary(head: Token, precedence: number): Expression {
    let left = this.#unary(head);
    for (;;) {
      const a = Parser.TABLE[this.next.type];
      if (!a) return left;
      const [b, c] = a;
      if (b < precedence) return left;
      left = new Binary(this.#pop(), left, this.#binary(this.#pop(), c));
    }
  }

  #expression(token: Token): Expression {
    return this.#binary(token, 0);
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
      case TokenType.BREAK:
        statement = this.next.type === TokenType.IDENTIFIER
          ? new Break(token, this.lexeme(this.#pop()))
          : new Break(token);
        break;
      case TokenType.CONTINUE:
        statement = this.next.type === TokenType.IDENTIFIER
          ? new Continue(token, this.lexeme(this.#pop()))
          : new Continue(token);
        break;
      case TokenType.LOG: {
        statement = new LogStatement(token, this.#expression(this.#pop()));
        break;
      }
      case TokenType.IF: {
        const condition = this.#expression(this.#pop());
        const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
        if (this.#match(TokenType.ELSE)) {
          return new IfStatement(
            token,
            condition,
            ifTrue,
            this.#block(this.#consume(TokenType.BRACE_LEFT)),
          );
        }
        return new IfStatement(token, condition, ifTrue);
      }
      case TokenType.WHILE:
        return new WhileStatement(
          token,
          this.#expression(this.#pop()),
          this.#block(this.#consume(TokenType.BRACE_LEFT)),
        );
      case TokenType.VAR: {
        const variable = this.#consume(TokenType.IDENTIFIER);
        const key = new Variable(variable, this.lexeme(variable));
        if (this.#match(TokenType.BE)) {
          statement = new VarDeclaration(
            token,
            key,
            this.#expression(this.#pop()),
          );
          break;
        }
        statement = new VarDeclaration(token, key);
        break;
      }
      case TokenType.IDENTIFIER:
        if (this.#match(TokenType.COLON)) {
          return new WhileStatement(
            this.#consume(TokenType.WHILE),
            this.#expression(this.#pop()),
            this.#block(this.#consume(TokenType.BRACE_LEFT)),
            this.lexeme(token),
          );
        }
        statement = this.#expression(token);
        break;
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
