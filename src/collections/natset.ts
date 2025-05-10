export class NatSet {
  #entries: number[] = [];
  add(number: number) {
    if (!(number >= 0 && Number.isInteger(number))) {
      throw new TypeError(`Invalid argument: ${number}`);
    }
    const index = number >> 5;
    while (this.#entries.length <= index) {
      this.#entries.push(0);
    }
    this.#entries[index] |= 1 << (number & 31);
  }
  remove(number: number) {
    if (!(number >= 0 && Number.isInteger(number))) {
      throw new TypeError(`Invalid argument: ${number}`);
    }
    const index = number >> 5;
    if (this.#entries.length <= index) return;
    this.#entries[index] &= -1 ^ (1 << (number & 31));
  }
  has(number: number) {
    if (!(number > 0 && Number.isInteger(number))) return false;
    const index = number >> 5;
    if (this.#entries.length <= index) return false;
    return ((1 << (number & 31)) & this.#entries[index]) !== 0;
  }
  clear() {
    this.#entries.length = 0;
  }
  *iterate() {
    for (let i = 0, l = this.#entries.length; i < l; i++) {
      for (let j = 0; j < 32; j++) {
        if (((1 << j) & this.#entries[j]) !== 0) {
          yield (i << 5) + j;
        }
      }
    }
  }
  isEmpty() {
    for (const entry of this.#entries) {
      if (entry > 0) return false;
    }
    return true;
  }
}
