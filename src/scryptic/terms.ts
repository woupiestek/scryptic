import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";

export const ALPHA = "\u03b1";
export const KAPPA = "\u03ba";
export const LAMBDA = "\u03bb";
export const IS = "=";

// assume root at end
export class Term {
  nodes: string[] = [];
  sizes: number[] = [];

  static get(name: string) {
    assert(/^[A-Z_a-z]+$/.test(name));
    const that = new Term();
    that.nodes.push(name);
    that.sizes.push(1);
    return that;
  }

  set(name: string, that: Term) {
    assert(/^[A-Z_a-z]+$/.test(name));
    const thatToo = new Term();
    thatToo.nodes.push(...this.nodes, name, ...that.nodes, IS);
    thatToo.sizes.push(
      ...this.sizes,
      1,
      ...that.sizes,
      this.sizes.length + that.sizes.length + 2,
    );
    return thatToo;
  }

  #unary(root: string) {
    const that = new Term();
    that.nodes.push(...this.nodes, root);
    that.sizes.push(...this.sizes, this.sizes.length + 1);
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

  toString(index = this.sizes.length - 1) {
    const strings: string[] = [];
    const j = 1 + index - this.sizes[index];
    for (let i = 0, l = this.sizes[index]; i < l; i++) {
      switch (this.nodes[i + j]) {
        case ALPHA:
        case KAPPA:
        case LAMBDA:
          strings[i] = strings[i - 1] + "\u00b7" + this.nodes[i + j];
          break;
        case "=":
          {
            const i2 = i - 1;
            const i1 = i2 - this.sizes[i2 + j];
            strings[i] = "[" + strings[i1 - this.sizes[i1 + j]] + " " +
              strings[i1] +
              " " + strings[i2] + "]";
          }
          break;
        default:
          strings[i] = this.nodes[i + j];
          break;
      }
    }
    return strings.pop();
  }
}
