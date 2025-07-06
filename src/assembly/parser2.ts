import { LinkedList } from "../collections/linkedList.ts";
import { Table } from "../collections/table.ts";
import { Trie } from "../collections/trie.ts";
import { Lex, TokenType } from "./lex.ts";

export class ParseError extends Error {
  constructor(readonly token: number, msg: string) {
    super(msg);
  }
}

export class Node {
  constructor(
    readonly token: number,
    readonly children: Node[],
    readonly parameter?: number,
  ) {}
}

export class Parser {
  private next = 0;
  private stringKey = 0;
  private strings: Trie<number> = new Trie();

  constructor(private lex: Lex) {}

  #pop() {
    return this.next++;
  }

  #error(token: number, msg: string) {
    const [l, c] = this.lex.lineAndColumn(token);
    return new ParseError(
      token,
      `Error at line ${l}, column ${c}, token ${
        TokenType[this.lex.types[token]]
      } "${this.lex.lexeme(token)}": ${msg}`,
    );
  }

  #consume(type: TokenType) {
    const token = this.#pop();
    if (this.lex.types[token] !== type) {
      throw this.#error(token, `expected ${TokenType[type]}`);
    }
    return token;
  }

  #store(s: string) {
    return this.strings.getTrie(s.length, (i) => s.charCodeAt(i)).value ||= this
      .stringKey++;
  }

  static #PREFIX: ((p: Parser) => Node)[] = [];
  static {
    Parser.#PREFIX[TokenType.FALSE] = (p) => new Node(p.#pop(), []);
    Parser.#PREFIX[TokenType.IDENTIFIER] = (p) => {
      const t = p.#pop();
      return new Node(t, [], p.#store(p.lex.lexeme(t)));
    };
    Parser.#PREFIX[TokenType.LOG] = (p) => new Node(p.#pop(), [p.#unary()]);
    Parser.#PREFIX[TokenType.NEW] = (p) => {
      const t = p.#pop();
      return new Node(
        t,
        [],
        p.#store(p.lex.lexeme(p.#consume(TokenType.IDENTIFIER))),
      );
    };
    Parser.#PREFIX[TokenType.NOT] = (p) => new Node(p.#pop(), [p.#unary()]);
    Parser.#PREFIX[TokenType.PAREN_LEFT] = (p) => {
      p.#pop();
      const e = p.#expression();
      p.#consume(TokenType.PAREN_RIGHT);
      return e;
    };
    Parser.#PREFIX[TokenType.STRING] = (p) => {
      const t = p.#pop();
      return new Node(t, [], p.#store(JSON.parse(p.lex.lexeme(t))));
    };
    Parser.#PREFIX[TokenType.THIS] = (p) => {
      const t = p.#pop();
      return new Node(t, []);
    };
    Parser.#PREFIX[TokenType.TRUE] = (p) => new Node(p.#pop(), []);
    Parser.#PREFIX[TokenType.VAR] = (p) => {
      return new Node(
        p.#pop(),
        [],
        p.#store(p.lex.lexeme(p.#consume(TokenType.IDENTIFIER))),
      );
    };
  }

  #unary(): Node {
    const prefix = Parser.#PREFIX[this.lex.types[this.next]];
    if (!prefix) {
      throw this.#error(this.next, "Expected expression");
    }
    return prefix(this);
  }

  static #__binary(precedence: number) {
    return (that: Parser, left: Node) =>
      new Node(that.#pop(), [left, that.#binary(precedence)]);
  }

  #match(type: TokenType) {
    if (this.lex.types[this.next] === type) {
      this.next++;
      return true;
    }
    return false;
  }

  static #__call(that: Parser, operator: Node): Node {
    const token = that.#pop();
    const nodes: Node[] = [operator];
    while (that.lex.types[that.next] !== TokenType.PAREN_RIGHT) {
      nodes.push(that.#expression());
      if (!that.#match(TokenType.COMMA)) break;
    }
    that.#consume(TokenType.PAREN_RIGHT);
    return new Node(token, nodes);
  }

  static #__access(that: Parser, expression: Node): Node {
    const token = that.#pop();
    const name = that.#store(
      that.lex.lexeme(that.#consume(TokenType.IDENTIFIER)),
    );
    return new Node(token, [expression], name);
  }

  static #INFIX: [number, (p: Parser, e: Node) => Node][] = [];
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

  #binary(precedence: number): Node {
    let left = this.#unary();
    for (;;) {
      const a = Parser.#INFIX[this.lex.types[this.next]];
      if (!a) return left;
      const [b, c] = a;
      if (b < precedence) return left;
      left = c(this, left);
    }
  }

  #expression(): Node {
    return this.#binary(0);
  }

  #block(braceLeft: number): Node {
    const statements: (Node)[] = [];
    for (;;) {
      switch (this.lex.types[this.next]) {
        case TokenType.BRACE_LEFT:
          statements.push(this.#block(this.#pop()));
          this.#consume(TokenType.BRACE_RIGHT);
          continue;
        case TokenType.BRACE_RIGHT:
          return new Node(
            braceLeft,
            statements,
          );
        case TokenType.BREAK:
        case TokenType.CONTINUE: {
          const block = new Node(
            braceLeft,
            statements,
          );
          const token = this.next;
          this.next++;
          // note: break & continue on the outside!
          // throw out brace left?
          return this.lex.types[this.next] === TokenType.LABEL
            ? new Node(
              token,
              [block],
              this.#store(this.lex.lexeme(this.#pop())),
            )
            : new Node(token, [block]);
        }
        case TokenType.END:
          return new Node(
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
              new Node(
                token,
                [condition, ifTrue, ifFalse],
              ),
            );
          } else {
            statements.push(new Node(token, [condition, ifTrue]));
          }
          continue;
        }
        case TokenType.LABEL: {
          const label = this.#store(this.lex.lexeme(this.#pop()));
          const token = this.#consume(TokenType.WHILE);
          const condition = this.#expression();
          const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
          this.#consume(TokenType.BRACE_RIGHT);
          statements.push(
            new Node(
              token,
              [condition, ifTrue],
              label,
            ),
          );
          continue;
        }
        case TokenType.RETURN: {
          const token = this.next;
          this.next++;
          // returning on the outside too...
          if (
            this.lex.types[this.next] !== TokenType.END &&
            this.lex.types[this.next] !== TokenType.BRACE_RIGHT
          ) {
            return new Node(token, [
              new Node(
                braceLeft,
                statements,
              ),
              this.#expression(),
            ]);
          } else {
            return new Node(token, [
              new Node(
                braceLeft,
                statements,
              ),
            ]);
          }
        }
        case TokenType.WHILE: {
          const token = this.#pop();
          const condition = this.#expression();
          const ifTrue = this.#block(this.#consume(TokenType.BRACE_LEFT));
          this.#consume(TokenType.BRACE_RIGHT);
          statements.push(
            new Node(
              token,
              [condition, ifTrue],
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

  #class(): Node {
    const token = this.#pop();
    const ident = this.#consume(TokenType.IDENTIFIER);
    this.#consume(TokenType.BRACE_LEFT);
    const methods: Node[] = [];
    while (!this.#match(TokenType.BRACE_RIGHT)) {
      methods.push(this.#method());
    }
    return new Node(token, methods, this.#store(this.lex.lexeme(ident)));
  }

  #consumeOneOf(...types: TokenType[]) {
    const token = this.#pop();
    if (!types.includes(this.lex.types[token])) {
      throw this.#error(
        token,
        `expected one of ${types.map((it) => TokenType[it])}`,
      );
    }
    return token;
  }

  #method(): Node {
    const ident = this.#consumeOneOf(TokenType.IDENTIFIER, TokenType.NEW);
    const pl = this.#consume(TokenType.PAREN_LEFT);
    const operands: Node[] = [];
    while (this.lex.types[this.next] !== TokenType.PAREN_RIGHT) {
      const ident = this.#consume(TokenType.IDENTIFIER);
      operands.push(new Node(ident, [], this.#store(this.lex.lexeme(ident))));
      if (!this.#match(TokenType.COMMA)) break;
    }
    this.#consume(TokenType.PAREN_RIGHT);
    const body = this.#block(this.#consume(TokenType.BRACE_LEFT));
    this.#consume(TokenType.BRACE_RIGHT);
    return new Node(
      ident,
      [new Node(pl, operands), body],
      this.#store(this.lex.lexeme(ident)),
    );
  }

  script(): (Node)[] {
    const script: (Node)[] = [];
    while (!this.#match(TokenType.END)) {
      if (this.lex.types[this.next] === TokenType.CLASS) {
        script.push(this.#class());
      } else {
        script.push(this.#block(-1));
      }
    }
    return script;
  }

  static #string(list: LinkedList<number>): string {
    let s = "";
    while (!Trie.LL.isEmpty(list)) {
      s = String.fromCharCode(Trie.LL.head(list)) + s;
      list = Trie.LL.tail(list);
    }
    return s;
  }

  getStrings() {
    const table = new Table<string>();
    for (const [k, v] of this.strings.entries()) {
      table.set(v, Parser.#string(k));
    }
    return table;
  }
}
