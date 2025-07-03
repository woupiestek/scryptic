import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";

export const ALPHA = "\u03b1";
export const KAPPA = "\u03ba";
export const LAMBDA = "\u03bb";
export const IS = "=";

export class Term {
  nodes: string[] = [];
  // assume root at end?
  parents: number[] = [];

  static get(name: string) {
    assert(/^[A-Z_a-z]+$/.test(name));
    const that = new Term();
    that.nodes.push(name);
    that.parents.push(0);
    return that;
  }

  set(name: string, that: Term) {
    assert(/^[A-Z_a-z]+$/.test(name));
    const thatToo = new Term();
    thatToo.nodes.push(...this.nodes, name, ...that.nodes, IS);
    // alles verschuift...
    // toch!?
    thatToo.parents.push(
      ...this.parents,
      0,
      ...that.parents.map((p) => p + this.parents.length + 1),
      0,
    );
    const rootI = thatToo.parents.length - 1;
    thatToo.parents[rootI] = rootI;
    thatToo.parents[rootI - 1] = rootI;
    const nameI = this.parents.length;
    thatToo.parents[nameI] = rootI;
    thatToo.parents[nameI - 1] = rootI;
    return thatToo;
  }

  #unary(root: string) {
    const that = new Term();
    that.nodes.push(...this.nodes, root);
    that.parents.push(...this.parents, this.parents.length);
    that.parents[this.parents.length - 1] = this.parents.length;
    return that;
  }

  alpha() {
    return this.#unary(ALPHA);
  }

  kappa() {
    return this.#unary(KAPPA);
  }

  lambda() {
    return this.#unary(LAMBDA);
  }

  toString(index = this.nodes.length - 1) {
    const strings: string[] = [];
    for (let i = 0, l = this.nodes.length; i < l; i++) {
      let s;
      switch (this.nodes[i]) {
        case ALPHA:
        case KAPPA:
        case LAMBDA:
          s = strings[i] + "\u00b7" + this.nodes[i];
          break;
        case "=":
          s = " [" + strings[i].substring(1) + "]";
          break;
        default:
          s = " " + this.nodes[i];
          break;
      }
      if (i === index) return s.substring(1);
      strings[this.parents[i]] ??= "";
      strings[this.parents[i]] += s;
    }
  }
}
