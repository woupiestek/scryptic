import { cyrb53 } from "./cyrb53.ts";

export class StringPool {
  #table: { [_: number]: string } = Object.create(null);
  store(string: string): number {
    for (let id = cyrb53(string);; id++) {
      if (this.#table[id] === undefined) {
        this.#table[id] = string;
        return id;
      }
    }
  }
  fetch(id: number) {
    return this.#table[id];
  }
}
