import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";

export type LinkedList<_> = number & { readonly __tag: unique symbol };

export class LinkedLists<A> {
  #heads: A[] = [];
  #buffer = new ArrayBuffer(8, { maxByteLength: 2 ** 31 - 1 });
  #tails: Uint32Array = new Uint32Array(this.#buffer);

  // cause that is what the buffer is automatically filled with
  static readonly EMPTY = 0 as LinkedList<unknown>;

  constructor() {
    this.#tails[0] = 0;
  }

  get EMPTY(): LinkedList<A> {
    return 0 as LinkedList<A>;
  }

  isEmpty(list: LinkedList<A>) {
    return list === 0;
  }

  head(list: LinkedList<A>) {
    return this.#heads[list - 1];
  }

  tail(list: LinkedList<A>) {
    return this.#tails[list] as LinkedList<A>;
  }

  cons(head: A, tail: LinkedList<A>): LinkedList<A> {
    const l = this.#heads.push(head);
    if (this.#tails.length <= l) {
      this.#buffer.resize(
        this.#buffer.byteLength * 2,
      );
    }
    this.#tails[l] = tail;
    return l as LinkedList<A>;
  }

  *entries(list: LinkedList<A>) {
    assert(list <= this.#heads.length);
    for (
      let i = list;
      i > 0;
      i = this.#tails[i] as LinkedList<A>
    ) {
      yield this.#heads[i - 1];
    }
  }
}
