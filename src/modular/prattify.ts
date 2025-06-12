import { TokenType } from "./lexer.ts";
import { Frames, Op } from "./yap.ts";

export class Trees {
  #first: number[] = [];
  #next: number[] = [];
  #token: TokenType[] = [];
  #op: Op[] = [];

  constructor(frames: Frames) {
    const iByDepth: number[] = [];
    for (let i = frames.size() - 1; i >= 0; i--) {
      this.#token[i] = frames.token(i);
      this.#op[i] = frames.op(i);
      const depth = frames.depth(i);
      this.#next[i] = iByDepth[depth] ?? -1;
      iByDepth.length = depth;
      iByDepth[depth] = i;
      this.#first[i] = frames.isLeaf(i) ? -1 : i + 1;
    }
    this.#truncate();
  }

  #truncate() {
    for (let i = this.#op.length - 1; i >= 0; i--) {
      if (this.#op[this.#first[i]] === Op.Expr) {
        this.#first[i] = this.#expr(this.#first[i]);
      }
      if (this.#op[this.#next[i]] === Op.Expr) {
        this.#next[i] = this.#expr(this.#next[i]);
      }
      if (
        this.#op[this.#first[i]] === Op.Stmts ||
        this.#op[this.#first[i]] === Op.Else ||
        this.#op[this.#first[i]] === Op.ArgsTail
      ) {
        this.#first[i] = this.#first[this.#first[i]];
      }
      if (
        this.#op[this.#next[i]] === Op.Stmts ||
        this.#op[this.#next[i]] === Op.Else ||
        this.#op[this.#next[i]] === Op.ArgsTail
      ) {
        this.#next[i] = this.#first[this.#next[i]];
      }
      if (
        this.#op[this.#next[i]] === Op.Expect ||
        this.#op[this.#next[i]] === Op.Semicolon
      ) {
        this.#next[i] = -1;
      }
      if (
        this.#op[this.#first[i]] === Op.Expect ||
        this.#op[this.#first[i]] === Op.Semicolon
      ) {
        this.#first[i] = -1;
      }
    }
  }

  /*
   * apply these rules until exhaustion:
   * (Expr a (ExprTail b c) => (Expr (ExprTail a b) c)
   * (Expr a ExprTail) => a
   */
  #expr(expr: number) {
    let a = this.#first[expr];
    let tail = this.#next[a];
    let b = this.#first[tail];
    while (b >= 0) {
      this.#first[tail] = a;
      this.#next[tail] = this.#next[b];
      this.#next[a] = b;
      this.#next[b] = -1;
      a = tail;
      tail = this.#next[a];
      b = this.#first[tail];
    }
    this.#next[a] = this.#next[expr];
    return a;
  }

  #stringify(i: number, f: (_: number) => string): string {
    const tag = f(i);
    if (this.#first[i] === -1) return tag;
    const list = [tag];
    for (let j = this.#first[i]; j >= 0; j = this.#next[j]) {
      list.push(this.#stringify(j, f));
    }
    return "(" + list.join(" ") + ")";
  }

  tag(i: number) {
    return `${this.#token[i]}:${Op[this.#op[i]]}`;
  }

  toString(f: (_: number) => string = this.tag.bind(this)) {
    return this.#stringify(0, f);
  }

  #str(i: number, d: number, acc: string[]): void {
    acc.push("  ".repeat(d) + this.tag(i));
    if (this.#first[i] >= 0) {
      this.#str(this.#first[i], d + 1, acc);
    }
    if (this.#next[i] >= 0) {
      this.#str(this.#next[i], d, acc);
    }
  }

  str() {
    const acc: string[] = [];
    this.#str(0, 0, acc);
    return acc.join("\n");
  }
}
