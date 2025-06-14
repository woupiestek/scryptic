import { NatSet } from "../collections/natset.ts";
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

  #move(i: number) {
    switch (this.#op[i]) {
      case Op.Expr:
        return this.#expr(i);
      case Op.Stmts:
      case Op.Else:
      case Op.ArgsTail:
        return this.#first[i];
      case Op.Semicolon:
      case Op.Expect:
        return -1;
      default:
        return i;
    }
  }

  #truncate() {
    for (let i = this.#op.length - 1; i >= 0; i--) {
      this.#first[i] = this.#move(this.#first[i]);
      this.#next[i] = this.#move(this.#next[i]);
    }
  }

  /*
   * apply these rules until exhaustion:
   * (Expr a (ExprTail b c)) => (Expr (ExprTail a b) c)
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

  #stringify(i: number): string {
    const tag = this.tag(i);
    if (this.#first[i] === -1) return tag;
    const list = [tag];
    for (let j = this.#first[i]; j >= 0; j = this.#next[j]) {
      list.push(this.#stringify(j));
    }
    return "(" + list.join(" ") + ")";
  }

  tag(i: number) {
    return `${this.#token[i]}:${Op[this.#op[i]]}`;
  }

  toString() {
    return this.#stringify(0);
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

// this representation is a struggle.
export class Trees2 {
  #prev: number[] = [];
  #set = new NatSet();
  #token: TokenType[] = [];
  #op: Op[] = [];

  constructor(frames: Frames) {
    const is: number[] = [];
    for (let i = 0, l = frames.size(); i < l; i++) {
      this.#token[i] = frames.token(i);
      this.#op[i] = frames.op(i);
      const depth = frames.depth(i);
      if (depth < is.length) {
        this.#prev[i] = is[depth];
        this.#set.add(i);
      } else {
        this.#prev[i] = depth ? is[depth - 1] : -1;
      }
      is.length = depth;
      is.push(i);
    }
    this.#truncate();
  }

  #truncate() {
    for (let i = this.#op.length - 1; i >= 0; i--) {
      switch (this.#op[i]) {
        case Op.Semicolon:
          this.#prev[i] = -1;
          break;
        case Op.Stmt:
          // (pp . i:Stmt) => (pp i)
          {
            const pp = this.#prev[this.#prev[i]];
            if (pp === -1) return;
            this.#prev[this.#prev[i]] = -1;
            this.#prev[i] = pp;
            this.#set.add(i);
          }
          break;
        case Op.ExprTail: {
          // (e:Expr a (t:ExprTail b i:ExprTail)) => (t (e a b) i)
          if (!this.#set.has(i)) break;
          const b = this.#prev[i];
          if (b === -1 || this.#set.has(b)) break;
          const t = this.#prev[b];
          if (t === -1 || !this.#set.has(t) || this.#op[t] !== Op.ExprTail) {
            break;
          }
          const a = this.#prev[t];
          if (a === -1 || this.#set.has(b)) break;
          const e = this.#prev[a];
          if (e === -1 || this.#op[e] !== Op.Expr) break;

          this.#prev[t] = this.#prev[e];
          if (this.#set.has(e)) this.#set.add(t);
          else this.#set.remove(t);
          this.#prev[i] = e;
          this.#prev[b] = a;
          this.#set.add(b);
          this.#prev[e] = i;
          this.#set.remove(e);
        }
      }
    }
  }

  #str(
    i: number,
    first: number[],
    next: number[],
    d: number,
    acc: string[],
  ): void {
    if (i < 0) return;
    acc.push("  ".repeat(d) + `${this.#token[i]}:${Op[this.#op[i]]}`);
    this.#str(first[i] ?? -1, first, next, d + 1, acc);
    this.#str(next[i] ?? -1, first, next, d, acc);
  }

  str() {
    const first = Array(this.#prev.length).map(() => -1);
    const next = Array(this.#prev.length).map(() => -1);
    const bottom = [];
    for (let i = 0, l = this.#prev.length; i < l; i++) {
      if (this.#prev[i] === -1) {
        bottom.push(i);
        continue;
      }
      if (this.#set.has(i)) {
        next[this.#prev[i]] = i;
      } else {
        first[this.#prev[i]] = i;
      }
    }
    const acc: string[] = [];
    bottom.forEach((i) => this.#str(i, first, next, 0, acc));
    return acc.join("\n");
  }
}
