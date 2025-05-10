export class SplayMap<A> {
  #keys: number[] = [];
  #values: (A | undefined)[] = [];
  #lefts: number[] = [];
  #rights: number[] = [];

  #id = 0;

  #alloc(key: number) {
    const id = this.#id++;
    this.#keys[id] = key;
    this.#values[id] = undefined;
    this.#lefts[id] = -1;
    this.#rights[id] = -1;
    return id;
  }

  #rotate(that: number, pivot: number): number {
    if (that < 0) {
      return this.#alloc(pivot);
    }
    if (pivot > this.#keys[that]) {
      const right = this.#rotate(this.#rights[that], pivot);
      this.#rights[that] = this.#lefts[right];
      this.#lefts[right] = that;
      return right;
    }
    if (pivot < this.#keys[that]) {
      const left = this.#rotate(this.#lefts[that], pivot);
      this.#lefts[that] = this.#rights[left];
      this.#rights[left] = that;
      return left;
    }
    return that;
  }

  *entries(): Generator<[number, A]> {
    for (let i = this.#keys.length - 1; i >= 0; i--) {
      const value = this.#values[i];
      if (value !== undefined) {
        yield [this.#keys[i], value];
      }
    }
  }

  #root = -1;

  get(key: number) {
    return this.#values[this.#root = this.#rotate(this.#root, key)];
  }

  set(key: number, value: A) {
    this.#values[this.#root = this.#rotate(this.#root, key)] = value;
  }

  delete(key: number) {
    this.#values[this.#root = this.#rotate(this.#root, key)] = undefined;
  }
}
