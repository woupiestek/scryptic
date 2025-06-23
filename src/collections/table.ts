export class Table<A> {
  #mask = 7;
  #indices = new Uint32Array(this.#mask + 1);
  #values: (A | undefined)[] = new Array(this.#mask + 1);
  #load = 0;
  get(index: number) {
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      if (this.#values[i] === undefined) return undefined;
      if (this.#indices[i] === index) return this.#values[i];
    }
  }
  set(index: number, value: A) {
    if (this.#load >= this.#mask * .8) {
      this.#resize();
    }
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      let tombstone = -1;
      if (this.#values[i] === undefined) {
        if (tombstone > -1) {
          this.#indices[tombstone] = index;
          this.#values[tombstone] = value;
          return;
        }
        this.#indices[i] = index;
        this.#values[i] = value;
        this.#load++;
        return;
      }
      if (this.#indices[i] === index) {
        this.#values[i] = value;
        return;
      } else if (this.#values[i] === undefined && tombstone === -1) {
        tombstone = i;
      }
    }
  }
  #resize() {
    this.#mask = this.#mask * 2 + 1;
    this.#load = 0;
    const indices = this.#indices;
    const values = this.#values;
    this.#indices = new Uint32Array(this.#mask + 1);
    this.#values = new Array(this.#mask + 1);
    for (let i = 0, l = indices.length; i < l; i++) {
      const value = values[i];
      if (value !== undefined) {
        this.set(indices[i], value);
      }
    }
  }
  delete(index: number) {
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      if (this.#values[i] === undefined) return;
      if (this.#indices[i] === index) {
        this.#values[index] = undefined;
      }
    }
  }
  *entries(): Generator<[number, A]> {
    for (let i = 0, l = this.#indices.length; i < l; i++) {
      const value = this.#values[i];
      if (value !== undefined) yield [this.#indices[i], value];
    }
  }
  toString() {
    const pairs: string[] = [];
    for (const [k, v] of this.entries()) {
      pairs.push(k + ": " + v?.toString());
    }
    return "{" + pairs.join(", ") + "}";
  }
}
