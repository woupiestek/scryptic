import { UIntSet } from "../collections/uintset.ts";
import { Frames, Op } from "./yap.ts";

export class Trees {
  #first: number[] = [];
  #next: number[] = [];

  constructor(readonly frames: Frames) {
    const is: number[] = [];
    for (let i = frames.size() - 1; i >= 0; i--) {
      const depth = frames.depth(i);
      this.#next[i] = is[depth] ?? -1;
      is.length = depth;
      is[depth] = i;
      this.#first[i] = frames.isLeaf(i) ? -1 : i + 1;
    }
    this.#truncate();
  }

  #truncate() {
    for (let i = this.frames.size() - 1; i >= 0; i--) {
      this.#first[i] = this.#move(this.#first[i]);
      this.#next[i] = this.#move(this.#next[i]);
    }
  }

  #move(i: number) {
    switch (this.frames.op(i)) {
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
    return `${this.frames.token(i)}:${Op[this.frames.op(i)]}`;
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
  #parent: number[] = [];
  #freed = new UIntSet();

  #free(i: number) {
    this.#freed.add(i);
  }

  constructor(readonly frames: Frames) {
    this.#parent = Array(frames.size()).keys().map((i) => frames.parent(i))
      .toArray();
    this.#truncate();
  }

  #truncate() {
    const heads: number[] = [];
    const tails: number[] = [];
    const del: number[] = [];
    for (let i = this.frames.size() - 1; i >= 0; i--) {
      switch (this.frames.op(i)) {
        case Op.Semicolon:
        case Op.Expect:
          del.push(i);
          break;
        case Op.ExprHead:
          heads[this.#parent[i]] = i;
          break;
        case Op.ExprTail:
          tails[this.#parent[i]] = i;
          break;
        default:
          break;
      }
      const p = this.#parent[i];
      if (this.frames.op(p) === Op.Stmt) {
        this.#parent[i] = this.#parent[p];
        del.push(p);
      }
    }
    del.forEach((i) => this.#free(i));
    for (let i = this.frames.size() - 1; i >= 0; i--) {
      const head = heads[i];
      const tail = tails[i];
      if (head === undefined || tail === undefined) continue;
      this.#parent[head] = tail;
      this.#parent[tail] = this.#parent[i];
      if (this.frames.op(i) === Op.Expr) this.#free(i);
    }
  }

  #str(i: number, d: number, children: number[][], acc: string[]): void {
    if (i === this.frames.size()) acc.push("FREE");
    else {acc.push(
        "  ".repeat(d) + `${this.frames.token(i)}: ${Op[this.frames.op(i)]}`,
      );}
    children[i].forEach((it) => this.#str(it, d + 1, children, acc));
  }

  str() {
    const children: number[][] = this.#parent.map(() => []);
    const roots: number[] = [];
    for (let i = 0, l = this.#parent.length; i < l; i++) {
      if (this.#freed.has(i)) continue;
      if (this.#parent[i] === i) {
        roots.push(i);
        continue;
      }
      children[this.#parent[i]].push(i);
    }
    const acc: string[] = [];
    roots.forEach((i) => this.#str(i, 0, children, acc));
    return acc.join("\n");
  }
}
