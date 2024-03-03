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
  constructor(
    readonly token: Token,
    readonly klaz: string,
    readonly operands: Expression[],
  ) {}
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

export class Log implements Node {
  constructor(
    readonly token: Token,
    readonly value: Expression,
  ) {}
}

export class VarDeclaration implements Node {
  constructor(
    readonly token: Token,
    readonly key: Variable,
  ) {}
}

export class Return implements Node {
  constructor(readonly token: Token, readonly expression?: Expression) {}
}

export type Statement =
  | Block
  | Expression
  | IfStatement
  | Log
  | Return
  | WhileStatement;

export class Block implements Node {
  constructor(readonly token: Token, readonly statements: Statement[]) {}
}

export class Access implements Node {
  constructor(
    readonly token: Token,
    readonly object: Expression,
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
    readonly operator: Expression,
    readonly operands: Expression[],
  ) {}
}

export type Expression =
  | Access
  | Binary
  | Break
  | Call
  | Continue
  | LiteralBoolean
  | LiteralString
  | Log
  | New
  | Not
  | VarDeclaration
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

  #consumeOneOf(...types: TokenType[]) {
    const token = this.#pop();
    if (!types.includes(token.type)) {
      throw this.#error(
        token,
        `expected one of ${types.map((it) => TokenType[it])}`,
      );
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
    Parser.#PREFIX[TokenType.FALSE] = (_, t) => new LiteralBoolean(t, false);
    Parser.#PREFIX[TokenType.IDENTIFIER] = (p, t) =>
      new Variable(t, p.lexeme(t));
    Parser.#PREFIX[TokenType.LOG] = (p, t) => new Log(t, p.#unary(p.#pop()));
    Parser.#PREFIX[TokenType.NEW] = (p, t) => {
      const name = p.lexeme(p.#consume(TokenType.IDENTIFIER));
      p.#consume(TokenType.PAREN_LEFT);
      return new New(t, name, p.#operands());
    };
    Parser.#PREFIX[TokenType.NOT] = (p, t) => new Not(t, p.#unary(p.#pop()));
    Parser.#PREFIX[TokenType.PAREN_LEFT] = (p, _) => {
      const e = p.#expression(p.#pop());
      p.#consume(TokenType.PAREN_RIGHT);
      return e;
    };
    Parser.#PREFIX[TokenType.STRING] = (p, t) =>
      new LiteralString(t, JSON.parse(p.lexeme(t)));
    Parser.#PREFIX[TokenType.THIS] = (p, t) => new Variable(t, p.lexeme(t));
    Parser.#PREFIX[TokenType.TRUE] = (_, t) => new LiteralBoolean(t, true);
    Parser.#PREFIX[TokenType.VAR] = (p, t) => {
      const v = p.#consume(TokenType.IDENTIFIER);
      return new VarDeclaration(t, new Variable(v, p.lexeme(v)));
    };
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

  #operands(): Expression[] {
    const operands: Expression[] = [];
    while (this.next.type !== TokenType.PAREN_RIGHT) {
      operands.push(this.#expression(this.#pop()));
      if (!this.#match(TokenType.COMMA)) break;
    }
    this.#consume(TokenType.PAREN_RIGHT);
    return operands;
  }

  static #__call(that: Parser, operator: Expression) {
    return new Call(that.#pop(), operator, that.#operands());
  }

  static #__access(that: Parser, expression: Expression) {
    const token = that.#pop();
    const name = that.lexeme(that.#consume(TokenType.IDENTIFIER));
    return new Access(token, expression, name);
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

  static #PREFIX2: ((p: Parser) => Expression)[] = [];
  static {
    Parser.#PREFIX2[TokenType.BRACE_LEFT] = (p) => p.#block(p.#pop());
    Parser.#PREFIX2[TokenType.BREAK] = (p) => {
      const t = p.#pop();
      const r = p.next.type === TokenType.LABEL
        ? new Break(t, p.lexeme(p.#pop()))
        : new Break(t);
      return r;
    };
    Parser.#PREFIX2[TokenType.CONTINUE] = (p) => {
      const t = p.#pop();
      const r = p.next.type === TokenType.LABEL
        ? new Continue(t, p.lexeme(p.#pop()))
        : new Continue(t);
      return r;
    };
    Parser.#PREFIX2[TokenType.IF] = (p) => {
      const t = p.#pop();
      const condition = p.#expression(p.#pop());
      const ifTrue = p.#block(p.#consume(TokenType.BRACE_LEFT));
      if (p.#match(TokenType.ELSE)) {
        return new IfStatement(
          t,
          condition,
          ifTrue,
          p.#block(p.#consume(TokenType.BRACE_LEFT)),
        );
      }
      return new IfStatement(t, condition, ifTrue);
    };
    Parser.#PREFIX2[TokenType.WHILE] = (p) =>
      new WhileStatement(
        p.#pop(),
        p.#expression(p.#pop()),
        p.#block(p.#consume(TokenType.BRACE_LEFT)),
      );
    Parser.#PREFIX2[TokenType.LABEL] = (p) => {
      const token = p.#pop();
      const label = p.lexeme(token);
      return new WhileStatement(
        p.#consume(TokenType.WHILE),
        p.#expression(p.#pop()),
        p.#block(p.#consume(TokenType.BRACE_LEFT)),
        label,
      );
    };
    Parser.#PREFIX2[TokenType.RETURN] = (p) => {
      const token = p.#pop();
      if (
        p.next.type !== TokenType.END && p.next.type !== TokenType.BRACE_RIGHT
      ) {
        return new Return(token, p.#expression(p.#pop()));
      }
      return new Return(token);
    };
  }

  #expressionStatement(token: Token): Statement {
    const statement = this.#expression(token);
    if (
      this.next.type === TokenType.END ||
      this.next.type === TokenType.BRACE_RIGHT
    ) return statement;
    this.#consume(TokenType.SEMICOLON);
    return statement;
  }

  #statement(): Statement {
    const prefix = Parser.#PREFIX2[this.next.type];
    if (prefix) {
      return prefix(this);
    }
    return this.#expressionStatement(this.#pop());
  }

  // todo: constructor?
  #class(): ClassDeclaration {
    const token = this.#pop();
    const ident = this.#consume(TokenType.IDENTIFIER);
    const name = new Variable(ident, this.lexeme(ident));
    this.#consume(TokenType.BRACE_LEFT);
    const methods: MethodDeclaration[] = [];
    while (!this.#match(TokenType.BRACE_RIGHT)) {
      methods.push(this.#method());
    }
    return new ClassDeclaration(token, name, methods);
  }

  #method(): MethodDeclaration {
    const ident = this.#consumeOneOf(TokenType.IDENTIFIER, TokenType.NEW);
    const name = new Variable(ident, this.lexeme(ident));
    this.#consume(TokenType.PAREN_LEFT);
    const operands: Variable[] = [];
    while (this.next.type !== TokenType.PAREN_RIGHT) {
      const ident = this.#consume(TokenType.IDENTIFIER);
      operands.push(new Variable(ident, this.lexeme(ident)));
      if (!this.#match(TokenType.COMMA)) break;
    }
    this.#consume(TokenType.PAREN_RIGHT);
    return new MethodDeclaration(
      ident,
      name,
      operands,
      this.#block(this.#consume(TokenType.BRACE_LEFT)),
    );
  }

  script(): Statement[] {
    const script: (Statement | ClassDeclaration)[] = [];
    while (!this.#match(TokenType.END)) {
      if (this.next.type === TokenType.CLASS) {
        script.push(this.#class());
        continue;
      }
      script.push(this.#statement());
    }
    return script;
  }
}
