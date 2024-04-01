type Table<A> = { index: number; value?: A }[];

export class Map<A> {
  #mask = 7;
  #table: Table<A> = Array.from({ length: this.#mask + 1 });
  #load = 0;
  get(index: number) {
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      if (!this.#table[i]) return;
      if (this.#table[i].index === index) return this.#table[i].value;
    }
  }
  set(index: number, value: A) {
    if (this.#load >= this.#mask * .8) {
      this.#resize();
    }
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      let tombstone = -1;
      if (!this.#table[i]) {
        if (tombstone > -1) {
          this.#table[tombstone] = { index, value };
          return;
        }
        this.#table[i] = { index, value };
        this.#load++;
        return;
      }
      if (this.#table[i].index === index) {
        this.#table[i].value = value;
        return;
      } else if (this.#table[i].value === undefined && tombstone === -1) {
        tombstone = i;
      }
    }
  }
  #resize() {
    this.#mask = this.#mask * 2 + 1;
    this.#load = 0;
    const table = this.#table;
    this.#table = Array.from({ length: this.#mask + 1 });
    for (const entry of table) {
      if (entry?.value !== undefined) {
        this.set(entry.index, entry.value);
      }
    }
  }
  delete(index: number) {
    for (let i = index & this.#mask;; i = (i + 1) & this.#mask) {
      if (!this.#table[i]) return;
      if (this.#table[i].index === index) {
        delete this.#table[index].value;
      }
    }
  }
  *entries(): Generator<[number, A]> {
    for (const entry of this.#table) {
      if (entry?.value !== undefined) yield [entry.index, entry.value];
    }
  }
}
