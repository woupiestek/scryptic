function h(string: string) {
  let hash = 3037000500;
  for (let i = string.length; i >= 0; i--) {
    hash = Math.imul(hash + string.charCodeAt(i), 37) >>> 0;
  }
  return hash;
}

export class StringPool {
  #table: { [_: number]: string } = Object.create(null);

  store(string: string): number {
    for (let id = h(string);; id++, id >>>= 0) {
      if ((this.#table[id] ??= string) === string) {
        return id;
      }
    }
  }

  fetch(id: number) {
    return this.#table[id];
  }

  toString() {
    return JSON.stringify(this.#table);
  }
}
