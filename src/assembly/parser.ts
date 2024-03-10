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

export class New implements Node {
  constructor(
    readonly token: Token,
    readonly klaz: string,
    // readonly operands: Expression[],
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

export type Statement = Block | Expression | IfStatement | WhileStatement;
export type Jump = Break | Continue | Return;

export class Block implements Node {
  constructor(
    readonly token: Token,
    readonly statements: Statement[],
    readonly jump?: Jump,
  ) {}
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

export class Literal implements Node {
  constructor(
    readonly token: Token,
    readonly value: boolean | string,
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
  | Call
  | Literal
  | Log
  | New
  | Not
  | VarDeclaration
  | Variable;

export class MethodDeclaration implements Node {
  constructor(
    readonly token: Token,
    readonly name: string,
    readonly args: Variable[],
    readonly body: Block,
  ) {}
}

export class ClassDeclaration implements Node {
  constructor(
    readonly token: Token,
    readonly name: string,
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

  static #PREFIX: ((p: Parser) => Expression)[] = [];
  static {
    Parser.#PREFIX[TokenType.FALSE] = (p) => new Literal(p.#pop(), false);
    Parser.#PREFIX[TokenType.IDENTIFIER] = (p) => {
      const t = p.#pop();
      return new Variable(t, p.lexeme(t));
    };
    Parser.#PREFIX[TokenType.LOG] = (p) => new Log(p.#pop(), p.#unary());
    Parser.#PREFIX[TokenType.NEW] = (p) => {
      const t = p.#pop();
      const name = p.lexeme(p.#consume(TokenType.IDENTIFIER));
      return new New(t, name);
    };
    Parser.#PREFIX[TokenType.NOT] = (p) => new Not(p.#pop(), p.#unary());
    Parser.#PREFIX[TokenType.PAREN_LEFT] = (p) => {
      p.#pop();
      const e = p.#expression();
      p.#consume(TokenType.PAREN_RIGHT);
      return e;
    };
    Parser.#PREFIX[TokenType.STRING] = (p) => {
      const t = p.#pop();
      return new Literal(t, JSON.parse(p.lexeme(t)));
    };
    Parser.#PREFIX[TokenType.THIS] = (p) => {
      const t = p.#pop();
      return new Variable(t, p.lexeme(t));
    };
    Parser.#PREFIX[TokenType.TRUE] = (p) => new Literal(p.#pop(), true);
    Parser.#PREFIX[TokenType.VAR] = (p) => {
      const t = p.#pop();
      const v = p.#consume(TokenType.IDENTIFIER);
      return new VarDeclaration(t, new Variable(v, p.lexeme(v)));
    };
  }

  #unary(): Expression {
    const prefix = Parser.#PREFIX[this.next.type];
    if (!prefix) {
      throw this.#error(this.next, "Expected expression");
    }
    return prefix(this);
  }

  static #__binary(precedence: number) {
    return (self: Parser, left: Expression) =>
      new Binary(self.#pop(), left, self.#binary(precedence));
  }

  #operands(): Expression[] {
    const operands: Expression[] = [];
    while (this.next.type !== TokenType.PAREN_RIGHT) {
      operands.push(this.#expression());
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

  #binary(precedence: number): Expression {
    let left = this.#unary();
    for (;;) {
      const a = Parser.#INFIX[this.next.type];
      if (!a) return left;
      const [b, c] = a;
      if (b < precedence) return left;
      left = c(this, left);
    }
  }

  #expression(): Expression {
    return this.#binary(0);
  }

  #block(braceLeft: Token): Block {
    const statements: (Block | Expression | IfStatement | WhileStatement)[] =
      [];
    for (;;) {
      switch (this.next.type) {
        case TokenType.BRACE_LEFT:
          statements.push(this.#block(this.#pop()));
          this.#consume(TokenType.BRACE_RIGHT);
          continue;
        case TokenType.BRACE_RIGHT:
          return new Block(
            braceLeft,
            statements,
          );
        case TokenType.BREAK: {
          const token = this.next;
          this.next = this.lexer.next();
          return new Block(
            braceLeft,
            statements,
            this.next.type === TokenType.LABEL
              ? new Break(token, this.lexeme(this.#pop()))
              : new Break(token),
          );
        }
        case TokenType.CONTINUE: {
          const token = this.next;
          this.next = this.lexer.next();
          return new Block(
            braceLeft,
            statements,
            this.next.type === TokenType.LABEL
              ? new Continue(token, this.lexeme(this.#pop()))
              : new Continue(token),
          );
        }
        case TokenType.END:
          return new Block(
            braceLeft,
            statements,
          );
        case TokenType.IF: {
          const token = this.#pop();
          const condition = this.#expression();
          const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
          this.#consume(TokenType.BRACE_RIGHT);
          if (this.#match(TokenType.ELSE)) {
            const ifFalse = this.#block(this.#consume(TokenType.BRACE_LEFT));
            this.#consume(TokenType.BRACE_RIGHT);
            statements.push(
              new IfStatement(
                token,
                condition,
                ifTrue,
                ifFalse,
              ),
            );
          } else {
            statements.push(new IfStatement(token, condition, ifTrue));
          }
          continue;
        }
        case TokenType.LABEL: {
          const label = this.lexeme(this.#pop());
          const token = this.#consume(TokenType.WHILE);
          const condition = this.#expression();
          const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
          this.#consume(TokenType.BRACE_RIGHT);
          statements.push(
            new WhileStatement(
              token,
              condition,
              ifTrue,
              label,
            ),
          );
          continue;
        }
        case TokenType.RETURN: {
          const token = this.next;
          this.next = this.lexer.next();
          if (
            this.next.type !== TokenType.END &&
            this.next.type !== TokenType.BRACE_RIGHT
          ) {
            return new Block(
              braceLeft,
              statements,
              new Return(token, this.#expression()),
            );
          } else {
            return new Block(
              braceLeft,
              statements,
              new Return(token),
            );
          }
        }
        case TokenType.WHILE: {
          const token = this.#pop();
          const condition = this.#expression();
          const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
          this.#consume(TokenType.BRACE_RIGHT);
          statements.push(
            new WhileStatement(
              token,
              condition,
              ifTrue,
            ),
          );
          continue;
        }
        default: //expression
        {
          statements.push(this.#expression());
          if (this.#match(TokenType.SEMICOLON)) {
            continue;
          } else break;
        }
      }
    }
  }

  #class(): ClassDeclaration {
    const token = this.#pop();
    const ident = this.#consume(TokenType.IDENTIFIER);
    this.#consume(TokenType.BRACE_LEFT);
    const methods: MethodDeclaration[] = [];
    while (!this.#match(TokenType.BRACE_RIGHT)) {
      methods.push(this.#method());
    }
    return new ClassDeclaration(token, this.lexeme(ident), methods);
  }

  #method(): MethodDeclaration {
    const ident = this.#consumeOneOf(TokenType.IDENTIFIER, TokenType.NEW);
    this.#consume(TokenType.PAREN_LEFT);
    const operands: Variable[] = [];
    while (this.next.type !== TokenType.PAREN_RIGHT) {
      const ident = this.#consume(TokenType.IDENTIFIER);
      operands.push(new Variable(ident, this.lexeme(ident)));
      if (!this.#match(TokenType.COMMA)) break;
    }
    this.#consume(TokenType.PAREN_RIGHT);
    const body = this.#block(this.#consume(TokenType.BRACE_LEFT));
    this.#consume(TokenType.BRACE_RIGHT);
    return new MethodDeclaration(
      ident,
      this.lexeme(ident),
      operands,
      body,
    );
  }

  script(): (Block | ClassDeclaration)[] {
    const script: (Block | ClassDeclaration)[] = [];
    while (!this.#match(TokenType.END)) {
      if (this.next.type === TokenType.CLASS) {
        script.push(this.#class());
      } else {
        script.push(this.#block(new Token(TokenType.BRACE_LEFT, 0, 0, 1, 1)));
      }
    }
    return script;
  }
}
