import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { UIntSet } from "./uintset.ts";

export type LinkedList<_> = number & { readonly __tag: unique symbol };

export class LinkedLists<A> {
  #heads: A[] = [];
  #buffer = new ArrayBuffer(8, { maxByteLength: 2 ** 31 - 1 });
  #tails: Uint32Array = new Uint32Array(this.#buffer);
  #next = 0;

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
    while (this.#heads[this.#next++] !== undefined);
    this.#heads[this.#next - 1] = head;
    if (this.#tails.length <= this.#next) {
      this.#buffer.resize(
        this.#buffer.byteLength * 2,
      );
    }
    this.#tails[this.#next] = tail;
    return this.#next as LinkedList<A>;
  }

  // for garbage collection...
  retain(lists: LinkedList<A>[]) {
    const set = new UIntSet();
    for (const list of lists) {
      set.add(list);
    }
    while (this.#next >= 0) {
      if (set.has(this.#next)) {
        set.add(this.#tails[this.#next]);
      } else {
        // please work
        delete this.#heads[this.#next - 1];
        this.#tails[this.#next] = 0;
      }
      this.#next--;
    }
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
