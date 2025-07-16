import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Parse } from "../assembly/parse.ts";
import { TokenType } from "../assembly/lex.ts";

export class Compiler {
  constructor(readonly parse: Parse) {
    this.parse.children().forEach((it) => this.#statement(it));
  }

  show() {
    return this.#exprs.toString() + "\n" +
      this.#listStr(this.#stmts.keys().map((s) => this.#stmtsStr(s)).toArray());
  }

  #type(id: number) {
    return this.parse.lex.types[this.parse.tokens[id]];
  }

  #index(id: number) {
    return this.parse.lex.types[this.parse.tokens[id]];
  }

  #children(id: number) {
    return this.parse.children(id);
  }

  #exprs = new Expressions();

  #lexeme(id: number) {
    return this.parse.lex.lexeme(this.parse.tokens[id]);
  }

  // extra tails!?
  #expr(id: number, depth = 0) {
    assert(id !== undefined);
    this.#exprs.push(this.#type(id), depth, this.#lexeme(id));
    this.#children(id).map((it) => this.#expr(it, depth + 1));
  }

  #blocks: number[][] = [];

  #block(id: number): number {
    assert(id !== undefined);
    // how about block ends?
    // can't be right anyway...
    return this.#blocks.push(
      this.#children(id - 1).map((it) => this.#statement(it)),
    ) - 1;
  }

  // let them be unequal now.
  #stmts: number[][] = [];

  #statement(id: number) {
    const type = this.#type(id);
    switch (type) {
      case TokenType.BRACE_LEFT:
        return this.#stmts.push([type, this.#block(id - 1)]) - 1;
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
        if (this.parse.sizes[id] > 0) {
          return this.#stmts.push([
            type,
            -1,
          ]) - 1;
        }
        const children = this.#exprs.count();
        this.#expr(id - 1);
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
        this.#expr(id - 1);
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
  #value: string[] = []; // not sure how else to deal with identifiers, strings etc.

  count() {
    return this.#type.length;
  }

  push(type: TokenType, depth: number, value: string = ""): void {
    this.#type.push(type);
    this.#depth.push(depth);
    this.#value.push(value);
  }

  toString() {
    return this.#type.keys().map((key) =>
      `${key}:${"  ".repeat(this.#depth[key])}${TokenType[this.#type[key]]}${
        this.#value[key] === "" ? "" : `(${this.#value[key]})`
      }`
    ).toArray().join("\n");
  }
}
