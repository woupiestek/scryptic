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
    this.#rotateDownAndDeleteExpr();
  }

  #rotateDownAndDeleteExpr() {
    for (let i = this.#op.length - 1; i >= 0; i--) {
      if (this.#op[this.#first[i]] === Op.Expr) this.#expr(i);
    }
  }

  /*
   * apply these rules until exhaustion:
   * (i (Expr a (ExprTail b c) d) => (i (Expr (ExprTail a b) c) d)
   * (i (Expr a ExprTail) d) => (i a d)
   */
  #expr(parent: number) {
    let a = this.#first[this.#first[parent]];
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
    this.#next[a] = this.#next[this.#first[parent]];
    this.#first[parent] = a;
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
}
