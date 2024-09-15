import { Lexer, Token, TokenType } from "./lexer2.ts";

type ListId = number & { readonly __tag: unique symbol };
type NodeId = number & { readonly __tag: unique symbol };

export type Node = {
  lhs: number;
  op: Token;
  rhs: number;
};
export class AST {
  #nodes: Node[] = [];
  #lists: NodeId[][] = [];

  addNode(lhs: number, op: Token, rhs: number): NodeId {
    return this.#nodes.push({ lhs, op, rhs }) - 1 as NodeId;
  }

  // two operands could be len & offset
  addList(list: NodeId[]): ListId {
    return this.#lists.push(list) - 1 as ListId;
  }
}

export class Parser {
  private next: Token;
  private lexer: Lexer;
  private output = new AST();

  constructor(private input: string) {
    this.lexer = new Lexer(input);
    this.next = this.lexer.next();
  }

  #pop() {
    const token = this.next;
    this.next = this.lexer.next();
    return token;
  }

  #error(token: Token, msg: string) {
    const [l, c] = this.lexer.lineAndColumn(token.from);
    return new Error(
      `Error at line ${l}, column ${c}, token ${TokenType[token.type]} "\u2026${
        this.input.slice(token.from - 3, token.from + 3)
      }\u2026": ${msg}`,
    );
  }

  #consume(type: TokenType) {
    const token = this.#pop();
    if (token.type !== type) {
      throw this.#error(token, `expected ${TokenType[type]}`);
    }
    return token;
  }

  static #PREFIX: ((p: Parser) => NodeId)[] = [];
  static {
    Parser.#PREFIX[TokenType.FALSE] = (p) => p.output.addNode(0, p.#pop(), 0);
    Parser.#PREFIX[TokenType.IDENTIFIER] = (p) => {
      const t = p.#pop();
      return p.output.addNode(
        0,
        t,
        0,
      );
    };
    Parser.#PREFIX[TokenType.LOG] = (p) =>
      p.output.addNode(0, p.#pop(), p.#unary());
    Parser.#PREFIX[TokenType.NEW] = (p) => {
      const t = p.#pop();
      return p.output.addNode(
        0,
        t,
        p.#consume(TokenType.IDENTIFIER).from,
      );
    };
    Parser.#PREFIX[TokenType.NOT] = (p) =>
      p.output.addNode(0, p.#pop(), p.#unary());
    Parser.#PREFIX[TokenType.PAREN_LEFT] = (p) => {
      p.#pop();
      const e = p.#expression();
      p.#consume(TokenType.PAREN_RIGHT);
      return e;
    };
    Parser.#PREFIX[TokenType.STRING] = (p) => {
      const t = p.#pop();
      return p.output.addNode(
        0,
        t,
        0,
      );
    };
    Parser.#PREFIX[TokenType.THIS] = (p) => {
      const t = p.#pop();
      return p.output.addNode(0, t, 0);
    };
    Parser.#PREFIX[TokenType.TRUE] = (p) => p.output.addNode(0, p.#pop(), 0);
    Parser.#PREFIX[TokenType.VAR] = (p) =>
      p.output.addNode(
        0,
        p.#pop(),
        p.#consume(TokenType.IDENTIFIER).from,
      );
  }

  #unary(): NodeId {
    const prefix = Parser.#PREFIX[this.next.type];
    if (!prefix) {
      throw this.#error(this.next, "Expected expression");
    }
    return prefix(this);
  }

  static #__binary(precedence: number) {
    return (that: Parser, left: NodeId) =>
      that.output.addNode(left, that.#pop(), that.#binary(precedence));
  }

  #match(type: TokenType) {
    if (this.next.type === type) {
      this.next = this.lexer.next();
      return true;
    }
    return false;
  }

  #popOnMatch(type: TokenType) {
    if (this.next.type === type) {
      return this.#pop();
    }
    return undefined;
  }

  static #__call(that: Parser, operator: NodeId): NodeId {
    const token = that.#pop();
    const operands: NodeId[] = [];
    while (that.next.type !== TokenType.PAREN_RIGHT) {
      operands.push(that.#expression());
      if (!that.#match(TokenType.COMMA)) break;
    }
    that.#consume(TokenType.PAREN_RIGHT);
    return that.output.addNode(operator, token, that.output.addList(operands));
  }

  static #__access(that: Parser, expression: NodeId): NodeId {
    return that.output.addNode(
      expression,
      that.#pop(),
      that.#consume(TokenType.IDENTIFIER).from,
    );
  }

  static #INFIX: [number, (p: Parser, e: NodeId) => NodeId][] = [];
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

  #binary(precedence: number): NodeId {
    let left = this.#unary();
    for (;;) {
      const a = Parser.#INFIX[this.next.type];
      if (!a) return left;
      const [b, c] = a;
      if (b < precedence) return left;
      left = c(this, left);
    }
  }

  #expression(): NodeId {
    return this.#binary(0);
  }

  #block(braceLeft: Token): NodeId {
    const statements: NodeId[] = [];
    for (;;) {
      switch (this.next.type) {
        case TokenType.BRACE_LEFT:
          statements.push(this.#block(this.#pop()));
          this.#consume(TokenType.BRACE_RIGHT);
          continue;
        case TokenType.BRACE_RIGHT:
          return this.output.addNode(
            0,
            braceLeft,
            this.output.addList(statements),
          );
        case TokenType.BREAK:
        case TokenType.CONTINUE: {
          const token = this.#pop();
          const label = this.#popOnMatch(TokenType.LABEL);
          statements.push(
            this.output.addNode(
              0,
              token,
              label ? label.from : -1,
            ),
          );
          return this.output.addNode(
            0,
            braceLeft,
            this.output.addList(statements),
          );
        }
        case TokenType.END:
          return this.output.addNode(
            0,
            braceLeft,
            this.output.addList(statements),
          );
        case TokenType.IF: {
          const token = this.#pop();
          const args = [
            this.#expression(),
            this.#block(this.#consume(TokenType.BRACE_LEFT)),
          ];
          this.#consume(TokenType.BRACE_RIGHT);
          if (this.#match(TokenType.ELSE)) {
            args.push(this.#block(this.#consume(TokenType.BRACE_LEFT)));
            this.#consume(TokenType.BRACE_RIGHT);
          }
          statements.push(
            this.output.addNode(0, token, this.output.addList(args)),
          );
          continue;
        }
        case TokenType.LABEL: {
          const label = this.#pop().from;
          const token = this.#consume(TokenType.WHILE);
          const condition = this.#expression();
          const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
          this.#consume(TokenType.BRACE_RIGHT);
          statements.push(
            this.output.addNode(
              label,
              token,
              this.output.addList([
                condition,
                ifTrue,
              ]),
            ),
          );
          continue;
        }
        case TokenType.RETURN: {
          const token = this.next;
          this.next = this.lexer.next();
          // optional expression
          let value = -1;
          if (
            this.next.type !== TokenType.END &&
            this.next.type !== TokenType.BRACE_RIGHT
          ) {
            value = this.#expression();
          }
          statements.push(
            this.output.addNode(0, token, value),
          );
          return this.output.addNode(
            0,
            braceLeft,
            this.output.addList(statements),
          );
        }
        case TokenType.WHILE: {
          const token = this.#pop();
          const condition = this.#expression();
          const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
          this.#consume(TokenType.BRACE_RIGHT);
          statements.push(
            this.output.addNode(
              -1,
              token,
              this.output.addList([
                condition,
                ifTrue,
              ]),
            ),
          );
          continue;
        }
        default: //expression
        {
          statements.push(this.#expression());
          if (this.#match(TokenType.SEMICOLON)) {
            continue;
          } else {
            return this.output.addNode(
              0,
              braceLeft,
              this.output.addList(statements),
            );
          }
        }
      }
    }
  }

  // no support for classes now
  script(): NodeId[] {
    const script: NodeId[] = [];
    while (!this.#match(TokenType.END)) {
      script.push(this.#block(new Token(TokenType.BRACE_LEFT, 0)));
    }
    return script;
  }
}
