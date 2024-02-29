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

// this
export class This implements Node {
  constructor(readonly token: Token) {}
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
    readonly expression: Expression,
  ) {}
}

export class Variable implements Node {
  constructor(
    readonly token: Token,
    readonly name: string,
  ) {}
}

// M.n(...)
export class Call implements Node {
  constructor(
    readonly token: Token,
    readonly operator: MemberAccess,
    readonly operands: Expression[],
  ) {}
}

export type Expression =
  | Binary
  | Call
  | LiteralBoolean
  | LiteralString
  | MemberAccess
  | New
  | Not
  | Variable;

// method(...) {...}
export class MethodDeclaration implements Node {
  constructor(
    readonly token: Token,
    readonly name: Variable,
    readonly args: Variable[],
    readonly body: Block,
  ) {}
}

// class name { ... }
export class ClassDeclaration implements Node {
  constructor(
    readonly token: Token,
    readonly name: Variable,
    readonly methods: MethodDeclaration[],
  ) {}
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

  static #PREFIX: ((p: Parser, t: Token) => Expression)[] = [];
  static {
    Parser.#PREFIX[TokenType.NOT] = (p, t) => new Not(t, p.#unary(p.#pop()));
    Parser.#PREFIX[TokenType.PAREN_LEFT] = (p, _) => {
      const e = p.#expression(p.#pop());
      p.#consume(TokenType.PAREN_RIGHT);
      return e;
    };
    Parser.#PREFIX[TokenType.IDENTIFIER] = (p, t) =>
      new Variable(t, p.lexeme(t));
    Parser.#PREFIX[TokenType.FALSE] = (_, t) => new LiteralBoolean(t, false);
    Parser.#PREFIX[TokenType.TRUE] = (_, t) => new LiteralBoolean(t, true);
    Parser.#PREFIX[TokenType.STRING] = (p, t) =>
      new LiteralString(t, JSON.parse(p.lexeme(t)));
    Parser.#PREFIX[TokenType.NEW] = (_, t) => new New(t);
  }

  #unary(head: Token): Expression {
    const prefix = Parser.#PREFIX[head.type];
    if (!prefix) {
      throw this.#error(head, "Expected expression");
    }
    return prefix(this, head);
  }

  static #__binary(precedence: number) {
    return (self: Parser, left: Expression) =>
      new Binary(self.#pop(), left, self.#binary(self.#pop(), precedence));
  }

  static #__call(that: Parser, operator: Expression) {
    if (!(operator instanceof MemberAccess)) {
      throw that.#error(that.next, "Only methods supported as of now");
    }
    const head = that.#pop();
    const operands: Expression[] = [];
    for (;;) {
      that.#expression(that.#pop());
      if (!that.#match(TokenType.COMMA)) break;
    }
    that.#consume(TokenType.PAREN_RIGHT);
    return new Call(head, operator, operands);
  }

  static #__access(that: Parser, expression: Expression) {
    if (expression instanceof MemberAccess || expression instanceof Variable) {
      const token = that.#pop();
      const name = that.lexeme(that.#consume(TokenType.IDENTIFIER));
      return new MemberAccess(token, expression, name);
    }
    throw that.#error(that.next, "Access not supported here");
  }

  static #INFIX: [number, (p: Parser, e: Expression) => Expression][] = [];
  static {
    Parser.#INFIX[TokenType.AND] = [2, Parser.#__binary(2)];
    Parser.#INFIX[TokenType.BE] = [1, Parser.#__binary(0)];
    Parser.#INFIX[TokenType.DOT] = [4, Parser.#__access];
    Parser.#INFIX[TokenType.IS_NOT] = [3, Parser.#__binary(3)];
    Parser.#INFIX[TokenType.IS] = [3, Parser.#__binary(3)];
    Parser.#INFIX[TokenType.LESS] = [3, Parser.#__binary(3)];
    Parser.#INFIX[TokenType.MORE] = [3, Parser.#__binary(3)];
    Parser.#INFIX[TokenType.NOT_LESS] = [3, Parser.#__binary(3)];
    Parser.#INFIX[TokenType.NOT_MORE] = [3, Parser.#__binary(3)];
    Parser.#INFIX[TokenType.OR] = [2, Parser.#__binary(2)];
    Parser.#INFIX[TokenType.PAREN_LEFT] = [4, Parser.#__call];
  }

  #binary(head: Token, precedence: number): Expression {
    let left = this.#unary(head);
    for (;;) {
      const a = Parser.#INFIX[this.next.type];
      if (!a) return left;
      const [b, c] = a;
      if (b < precedence) return left;
      left = c(this, left);
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
