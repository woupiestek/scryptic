import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";

export class UIntSet {
  static readonly MAX = 2 ** 34 - 9;
  #buffer = new ArrayBuffer(0, { maxByteLength: 2 ** 31 - 1 });
  #entries: Uint8Array = new Uint8Array(this.#buffer);
  #valid(number: number): boolean {
    return (number >= 0 && number <= UIntSet.MAX && Number.isInteger(number));
  }
  add(number: number) {
    if (!this.#valid(number)) {
      throw new TypeError(`Invalid argument: ${number}`);
    }
    const index = number >> 3;
    let size = this.#entries.length || 8;
    while (size <= index) {
      size <<= 1;
    }
    if (size > this.#entries.length) {
      this.#buffer.resize(size);
    }

    this.#entries[index] |= 1 << (number & 7);
  }
  remove(number: number) {
    if (!this.#valid(number)) {
      throw new TypeError(`Invalid argument: ${number}`);
    }
    const index = number >> 3;
    if (this.#entries.length <= index) return;
    this.#entries[index] &= -1 ^ (1 << (number & 7));
  }
  has(number: number) {
    if (!this.#valid(number)) return false;
    const index = number >> 3;
    if (this.#entries.length <= index) return false;
    return ((1 << (number & 7)) & this.#entries[index]) !== 0;
  }
  clear() {
    this.#entries.fill(0, 0, this.#entries.length); // = 0;
  }
  *iterate() {
    for (let i = 0, l = 8 * this.#entries.length; i < l; i++) {
      if (this.has(i)) {
        yield i;
      }
    }
  }
  isEmpty() {
    for (const entry of this.#entries) {
      if (entry > 0) return false;
    }
    return true;
  }

  toString() {
    return `{${this.iterate().toArray().join(", ")}}`;
  }

  constructor(that?: Iterable<number>) {
    if (!that) return;
    for (const i of that) {
      this.add(i);
    }
  }
}

export function reverse(int: number) {
  int = ((int >> 1) & 0x55555555) | ((int & 0x55555555) << 1);
  int = ((int >> 2) & 0x33333333) | ((int & 0x33333333) << 2);
  int = ((int >> 4) & 0x0F0F0F0F) | ((int & 0x0F0F0F0F) << 4);
  int = ((int >> 8) & 0x00FF00FF) | ((int & 0x00FF00FF) << 8);
  int = (int >>> 16) | (int << 16);
  return int >>> 0;
}

// for sparse sets of numbers, or at least indices
class SparseSet {
  entries: Int32Array;
  #mask = -1;
  #size = 0;

  constructor(capacity: number) {
    this.entries = new Int32Array(capacity);
    this.#mask = 2 ** capacity - 1;
  }

  #search(int: number): number {
    assert(int > 0);
    let i = int & this.#mask;
    i = (i * (2 * i + 1)) & this.#mask;
    for (let j = i, l = this.entries.length; j < l; j++) {
      if (this.entries[j] === 0 || this.entries[j] === int) {
        return j;
      }
    }
    for (let j = 0; j < i; j++) {
      if (this.entries[j] === 0 || this.entries[j] === int) {
        return j;
      }
    }
    return -1;
  }

  add(int: number): number {
    const i = this.#search(int);
    if (i >= 0 && this.entries[i] === 0) {
      this.#size++;
      this.entries[i] = int;
    }
    return i;
  }

  index(int: number): number {
    const i = this.#search(int);
    if (i >= 0 && this.entries[i] === int) {
      return i;
    }
    return -1;
  }

  *indices() {
    for (let i = 0, l = this.entries.length; i < l; i++) {
      if (this.entries[i] === 0) continue;
      yield i;
    }
  }
}

export class UIntMap<A> {
  #keys: SparseSet = new SparseSet(0);
  #values: A[] = new Array(0);

  #grow() {
    const keys = this.#keys;
    const values = this.#values;
    const capacity = this.#values.length > 0 ? this.#values.length * 2 : 8;
    this.#keys = new SparseSet(capacity);
    this.#values = new Array(capacity);
    this.#size = 0;
    for (const i of this.#keys.indices()) {
      this.#set(keys?.entries[i], values[i]);
    }
  }

  #set(key: number, value: A) {
    this.#values[this.#keys.add(key)] = value;
  }

  #size = 0;

  get size() {
    return this.#size;
  }

  set(key: number, value: A) {
    if (this.#size > .75 * this.#values.length) {
      this.#grow();
    }
    if (this.#values[this.#keys.add(key)] === undefined) this.#size++;
    this.#values[this.#keys.add(key)] = value;
  }

  get(key: number) {
    return this.#values[this.#keys.add(key)];
  }
}
