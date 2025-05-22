import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Frames, Parser } from "./yap.ts";

export class Compiler {
  private readonly automaton: Automaton = new Automaton();
  private readonly parser: Parser;
  private readonly frames: Frames = new Frames();
  #script: number[];
  constructor(
    private readonly source: string,
  ) {
    this.automaton.readString(source);
    this.parser = new Parser(this.frames);
    this.parser.visitAll(this.automaton.types);
    const x = [...this.frames.closed()];
    this.#script = x.length
      ? [this.#statement(x[0]), ...this.#statements(x[1])]
      : [];
  }

  show() {
    return this.#listStr(this.#script.map((s) => this.#stmtsStr(s)));
  }

  #type(id: number) {
    return this.automaton.types[this.frames.token(id)];
  }

  #index(id: number) {
    return this.automaton.indices[this.frames.token(id)];
  }

  #children(id: number) {
    return this.frames.children(id);
  }

  #label(id: number) {
    if (
      this.#type(id) !== TokenType.LABEL
    ) return -1;
    const from = this.#index(id);
    let to = from;
    while (/[0-9A-Za-z]/.test(this.source[++to]));
    return this.source.slice(from, to);
  }

  #identifier(id: number) {
    if (
      this.#type(id) !== TokenType.LABEL
    ) return -1;
    const from = this.#index(id);
    let to = from;
    while (/[0-9A-Za-z]/.test(this.source[++to]));
    return this.source.slice(from, to);
  }

  #exprs: [number, number, number][] = [];

  #exprHead(id: number): number {
    assert(id !== undefined);
    const type = this.#type(id);
    const children = this.#children(id);
    if (type === TokenType.VAR) {
      return this.#exprs.push([
        -1,
        type,
        this.#index(children[0]),
      ]) - 1;
    }

    if (type === TokenType.PAREN_LEFT) {
      return this.#expr(children[0]);
    }

    return this.#exprs.push([
      -1,
      type,
      children.length ? this.#exprHead(children[0]) : this.#index(id),
    ]) - 1;
  }

  #argses: number[][] = [];

  #expr(id: number): number {
    assert(id !== undefined);
    const [h, t] = this.#children(id);
    const left = this.#exprHead(h);
    const children = t === undefined ? undefined : this.#children(t);
    const typeT = this.#type(t);
    if (!children?.length) return left;
    if (typeT === TokenType.PAREN_LEFT) {
      return this.#exprs.push([
        left,
        typeT,
        this.#argses.push(
          (this.#children(children[0])).map((child) => this.#expr(child)),
        ) - 1,
      ]) - 1;
    }
    if (typeT === TokenType.DOT) {
      return this.#exprs.push([left, typeT, this.#index(children[0])]) - 1;
    }
    return this.#exprs.push([left, typeT, this.#expr(children[0])]) - 1;
  }

  #exprStr(id: number): string {
    switch (this.#exprs[id][1]) {
      case TokenType.AND:
      case TokenType.BE:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR:
        return this.#listStr([
          this.#exprStr(this.#exprs[id][0]),
          TokenType[this.#exprs[id][1]],
          this.#exprStr(this.#exprs[id][2]),
        ]);
      case TokenType.FALSE:
      case TokenType.THIS:
      case TokenType.TRUE:
        return TokenType[this.#exprs[id][1]];
      case TokenType.LOG:
      case TokenType.NOT:
      case TokenType.NEW:
        return this.#listStr([
          TokenType[this.#exprs[id][1]],
          this.#exprStr(this.#exprs[id][2]),
        ]);
      case TokenType.IDENTIFIER:
      case TokenType.STRING:
      case TokenType.VAR:
      case TokenType.DOT:
        return this.#listStr([
          TokenType[this.#exprs[id][1]],
          this.#exprs[id][2].toString(),
        ]);
      case TokenType.PAREN_LEFT:
        return this.#listStr([
          this.#exprStr(this.#exprs[id][0]),
          ...this.#argses[this.#exprs[id][2]].map((i) => this.#exprStr(i)),
        ]);
      default:
        return this.#listStr([
          "?" + this.#exprs[id][0],
          TokenType[this.#exprs[id][1]],
          "?" + this.#exprs[id][2],
        ]);
    }
  }

  #blocks: number[][] = [];

  #block(id: number): number {
    assert(id !== undefined);
    // how about block ends?
    // can't be right anyway...
    return this.#blocks.push(
      this.#statements(this.#children(id)[0]),
    ) - 1;
  }

  // let them be unequal now.
  #stmts: number[][] = [];

  #statements(id: number) {
    const ids: number[] = [];
    for (;;) {
      const c = this.#children(id);
      if (c.length === 0) {
        return ids;
      }
      ids.push(this.#statement(c[0]));
      id = c[1];
    }
  }

  #statement(id: number) {
    const type = this.#type(id);
    switch (type) {
      case TokenType.BRACE_LEFT:
        return this.#stmts.push([type, this.#block(this.#children(id)[0])]) - 1;
      case TokenType.BREAK:
      case TokenType.CONTINUE: {
        const children = this.#children(id);
        return this.#stmts.push([
          type,
          children.length ? this.#index(children[0]) : -1,
        ]) - 1;
      }
      case TokenType.IF: {
        const [i, t, e] = this.#children(id);
        const f = this.#children(e);
        const ie = this.#expr(i);
        const tb = this.#block(t);
        const eb = f.length ? this.#block(f[0]) : -1;
        return this.#stmts.push([type, ie, tb, eb]) - 1;
      }
      case TokenType.LABEL: {
        const label = this.#index(id);
        const [c, b] = this.#children(id);
        const condition = this.#expr(c);
        const body = this.#block(b);
        return this.#stmts.push([TokenType.WHILE, label, condition, body]) - 1;
      }
      case TokenType.WHILE: {
        const label = -1;
        const [c, b] = this.#children(id);
        const condition = this.#expr(c);
        const body = this.#block(b);
        return this.#stmts.push([TokenType.WHILE, label, condition, body]) - 1;
      }
      case TokenType.RETURN: {
        const children = this.#children(id);
        return this.#stmts.push([
          type,
          children.length ? this.#expr(children[0]) : -1,
        ]) - 1;
      }
      case TokenType.SEMICOLON:
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
        return -1;
      default:
        // not pushing?
        return this.#stmts.push([-1, this.#expr(this.#children(id)[0])]) - 1;
    }
  }

  #listStr(strs: string[]) {
    if (strs.length === 1) return strs[0];
    return `(${strs.join(" ")})`;
  }

  #blockStr(id: number): string {
    if (id === -1) return "()";
    return this.#listStr(
      this.#blocks[id].map((i) => this.#stmtsStr(i)),
    );
  }

  #stmtsStr(id: number): string {
    if (id === -1) return ";";
    switch (this.#stmts[id][0]) {
      case TokenType.BRACE_LEFT:
        return this.#blockStr(this.#stmts[id][1]);
      case TokenType.BREAK:
      case TokenType.CONTINUE:
        return `(${TokenType[this.#stmts[id][0]]} ${this.#stmts[id][1]})`;
      case TokenType.IF:
        return this.#listStr(
          [
            TokenType[this.#stmts[id][0]],
            this.#exprStr(this.#stmts[id][1]),
            this.#blockStr(this.#stmts[id][2]),
            this.#blockStr(this.#stmts[id][3]),
          ],
        );
      case TokenType.WHILE:
        return this.#listStr(
          [
            TokenType[this.#stmts[id][0]],
            this.#stmts[id][1].toString(),
            this.#exprStr(this.#stmts[id][2]),
            this.#blockStr(this.#stmts[id][3]),
          ],
        );
      case TokenType.RETURN:
        return `(${TokenType[this.#stmts[id][0]]} ${
          this.#exprStr(this.#stmts[id][1])
        })`;
      case -1:
        return this.#exprStr(this.#stmts[id][1]);
      default: {
        const [h, ...t] = this.#stmts[id];
        return this.#listStr([TokenType[h], ...t.map((i) => i + "?")]);
      }
    }
  }
}
