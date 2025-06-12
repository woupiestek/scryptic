import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Parser } from "./yap.ts";

export class Compiler {
  private readonly automaton: Automaton = new Automaton();
  private readonly parser: Parser;
  // private readonly frames: Frames = new Frames();
  #script: number[];
  constructor(
    private readonly source: string,
  ) {
    this.automaton.readString(source);
    this.parser = new Parser();
    this.parser.visitAll(this.automaton.types);
    this.#script = this.#statements(0);
  }

  show() {
    return this.#exprs.toString() + "\n" +
      this.#listStr(this.#script.map((s) => this.#stmtsStr(s)));
  }

  #type(id: number) {
    return this.automaton.types[this.parser.frames.token(id)];
  }

  #index(id: number) {
    return this.automaton.indices[this.parser.frames.token(id)];
  }

  #children(id: number) {
    return this.parser.frames.children(id);
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

  #exprs = new Expressions();

  // return number of consumed nodes?
  #exprHead(id: number): number {
    assert(id !== undefined);
    const type = this.#type(id);
    if (type === TokenType.VAR) {
      this.#exprs.push(
        type,
        this.parser.frames.depth(id),
        this.#index(id + 1),
      );
      return 2;
    }

    if (type === TokenType.PAREN_LEFT) {
      return this.#expr(id + 1) + 1;
    }

    if (this.parser.frames.isLeaf(id)) {
      this.#exprs.push(type, this.parser.frames.depth(id), this.#index(id));
      return 1;
    }
    this.#exprs.push(type, this.parser.frames.depth(id));
    return this.#exprHead(id + 1) + 1;
  }

  // extra tails!?
  #expr(id: number): number {
    assert(id !== undefined);
    // don't rearrange yet!
    const h = this.#exprHead(id + 1) + 1;
    const t = id + h;
    if (this.parser.frames.isLeaf(t)) {
      return h; // not + 1?
    }
    const typeT = this.#type(t);
    if (typeT === TokenType.PAREN_LEFT) {
      this.#exprs.push(typeT, this.parser.frames.depth(t));
      let i = 1;
      for (
        const d = this.parser.frames.depth(t);
        this.parser.frames.depth(t + i) > d;
        i += this.#expr(t + i)
      );
      return h + i;
    }
    if (typeT === TokenType.DOT) {
      this.#exprs.push(typeT, this.parser.frames.depth(t), this.#index(t + 1));
      return h + 1;
    }
    this.#exprs.push(typeT, this.parser.frames.depth(t));
    return this.#expr(t + 1) + h + 1; // watch for off by 1
  }

  #blocks: number[][] = [];

  #block(id: number): number {
    assert(id !== undefined);
    // how about block ends?
    // can't be right anyway...
    return this.#blocks.push(
      this.#statements(id + 1),
    ) - 1;
  }

  // let them be unequal now.
  #stmts: number[][] = [];

  #statements(id: number) {
    const ids: number[] = [];
    for (;;) {
      const c = this.#children(id);
      if (c.length < 2) {
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
        return this.#stmts.push([type, this.#block(id + 1)]) - 1;
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
        const ie = this.#exprs.count();
        this.#expr(i);
        const tb = this.#block(t);
        const eb = f.length ? this.#block(f[0]) : -1;
        return this.#stmts.push([type, ie, tb, eb]) - 1;
      }
      case TokenType.LABEL: {
        const label = this.#index(id);
        const [c, b] = this.#children(id);
        const condition = this.#exprs.count();
        this.#expr(c);
        const body = this.#block(b);
        return this.#stmts.push([TokenType.WHILE, label, condition, body]) - 1;
      }
      case TokenType.WHILE: {
        const label = -1;
        const [c, b] = this.#children(id);
        const condition = this.#exprs.count();
        this.#expr(c);
        const body = this.#block(b);
        return this.#stmts.push([TokenType.WHILE, label, condition, body]) - 1;
      }
      case TokenType.RETURN: {
        if (this.parser.frames.isLeaf(id)) {
          return this.#stmts.push([
            type,
            -1,
          ]) - 1;
        }
        const children = this.#exprs.count();
        this.#expr(id + 1);
        return this.#stmts.push([
          type,
          children,
        ]) - 1;
      }
      case TokenType.SEMICOLON:
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
        return -1;
      default: { // not pushing?
        const children = this.#exprs.count();
        this.#expr(id + 1);
        return this.#stmts.push([-1, children]) - 1;
      }
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
            "" + (this.#stmts[id][1]),
            this.#blockStr(this.#stmts[id][2]),
            this.#blockStr(this.#stmts[id][3]),
          ],
        );
      case TokenType.WHILE:
        return this.#listStr(
          [
            TokenType[this.#stmts[id][0]],
            this.#stmts[id][1].toString(),
            "" + (this.#stmts[id][2]),
            this.#blockStr(this.#stmts[id][3]),
          ],
        );
      case TokenType.RETURN:
        return `(${TokenType[this.#stmts[id][0]]} ${
          "" + (this.#stmts[id][1])
        })`;
      case -1:
        return "" + (this.#stmts[id][1]);
      default: {
        const [h, ...t] = this.#stmts[id];
        return this.#listStr([TokenType[h], ...t.map((i) => i + "?")]);
      }
    }
  }
}

// keep using the depth vector
class Expressions {
  #type: TokenType[] = [];
  #depth: number[] = [];
  #value: number[] = []; // not sure how else to deal with identifiers, strings etc.

  count() {
    return this.#type.length;
  }

  push(type: TokenType, depth: number, value: number = -1): void {
    this.#type.push(type);
    this.#depth.push(depth);
    this.#value.push(value);
  }

  toString() {
    return this.#type.keys().map((key) =>
      `${key}:${"  ".repeat(this.#depth[key])}${TokenType[this.#type[key]]}${
        this.#value[key] === -1 ? "" : `(${this.#value[key]})`
      }`
    ).toArray().join("\n");
  }
}
