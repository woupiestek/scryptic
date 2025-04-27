type Entry<A> = { index: number; value?: A };

export class Table<A> {
  #mask = 7;
  #entries: Entry<A>[] = Array.from({ length: this.#mask + 1 });
  #load = 0;
  get(index: number) {
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      if (!this.#entries[i]) return;
      if (this.#entries[i].index === index) return this.#entries[i].value;
    }
  }
  set(index: number, value: A) {
    if (this.#load >= this.#mask * .8) {
      this.#resize();
    }
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      let tombstone = -1;
      if (!this.#entries[i]) {
        if (tombstone > -1) {
          this.#entries[tombstone] = { index, value };
          return;
        }
        this.#entries[i] = { index, value };
        this.#load++;
        return;
      }
      if (this.#entries[i].index === index) {
        this.#entries[i].value = value;
        return;
      } else if (this.#entries[i].value === undefined && tombstone === -1) {
        tombstone = i;
      }
    }
  }
  #resize() {
    this.#mask = this.#mask * 2 + 1;
    this.#load = 0;
    const table = this.#entries;
    this.#entries = Array.from({ length: this.#mask + 1 });
    for (const entry of table) {
      if (entry?.value !== undefined) {
        this.set(entry.index, entry.value);
      }
    }
  }
  delete(index: number) {
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      if (!this.#entries[i]) return;
      if (this.#entries[i].index === index) {
        delete this.#entries[index].value;
      }
    }
  }
  *entries(): Generator<[number, A]> {
    for (const entry of this.#entries) {
      if (entry?.value !== undefined) yield [entry.index, entry.value];
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
