type Data<A> =
  | {
    updated: false;
    array: (A | undefined)[];
  }
  | {
    updated: true;
    array: PersistentArray<A>;
    index: number;
    value?: A;
  };

export class PersistentArray<A> {
  private constructor(private data: Data<A>) {}
  static empty() {
    return new PersistentArray({ updated: false, array: [] });
  }

  // update array destructively, but generate undo data
  #update(
    values: (A | undefined)[],
    index: number,
    value?: A,
  ): Data<A> {
    const old = values[index];
    values[index] = value;
    return {
      updated: true,
      index,
      value: old,
      array: this,
    };
  }

  #reroot(): (A | undefined)[] {
    if (!this.data.updated) return this.data.array;
    const array = this.data.array.#reroot();
    this.data.array.data = this.#update(
      array,
      this.data.index,
      this.data.value,
    );
    this.data = { updated: false, array };
    return array;
  }

  get(index: number): A | undefined {
    return this.#reroot()[index];
  }

  set(index: number, value?: A): PersistentArray<A> {
    const array = this.#reroot();
    if (array[index] === value) return this;
    const next = new PersistentArray({ updated: false, array });
    this.data = next.#update(array, index, value);
    return next;
  }

  entries() {
    return this.#reroot();
  }

  toString() {
    return this.#reroot().toString();
  }
}
