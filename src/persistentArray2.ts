export class PersistentArray<A> {
  private constructor(
    private readonly index: number,
    private readonly height: number,
    private readonly value: A,
    private readonly left?: PersistentArray<A>,
    private readonly right?: PersistentArray<A>,
  ) {}

  // find the least zero in the binary number
  static height(index: number) {
    let height = 0;
    while ((index & 1) === 1) {
      height++;
      index >>>= 1;
    }
    return height;
  }

  static singleton<A>(index: number, value: A): PersistentArray<A> {
    return new this(index, PersistentArray.height(index), value);
  }

  get(index: number): A | undefined {
    if (PersistentArray.height(index) > this.height) return undefined;
    if (index < this.index) return this.left?.get(index);
    if (index === this.index) return this.value;
    return this.right?.get(index);
  }

  set(index: number, value: A): PersistentArray<A> {
    if (index < this.index) {
      const left = this.left
        ? this.left.set(index, value)
        : PersistentArray.singleton(index, value);
      if (left === this.left) return this;
      if (this.height < left.height) {
        new PersistentArray(
          left.index,
          left.height,
          left.value,
          left.left,
          new PersistentArray(
            this.index,
            this.height,
            this.value,
            left.right,
            this.right,
          ),
        );
      }
      return new PersistentArray(
        this.index,
        this.height,
        this.value,
        left,
        this.right,
      );
    }
    if (index === this.index) {
      if (value === this.value) return this;
      return new PersistentArray(
        this.index,
        this.height,
        value,
        this.left,
        this.right,
      );
    }
    const right = this.right
      ? this.right.set(index, value)
      : PersistentArray.singleton(index, value);
    if (right === this.right) return this;
    if (this.height < right.height) {
      new PersistentArray(
        right.index,
        right.height,
        right.value,
        new PersistentArray(
          this.index,
          this.height,
          this.value,
          this.left,
          right.left,
        ),
        right.right,
      );
    }
    return new PersistentArray(
      this.index,
      this.height,
      this.value,
      this.left,
      right,
    );
  }

  // would not work on random pairs
  static #merge<A>(
    left: PersistentArray<A>,
    right: PersistentArray<A>,
  ): PersistentArray<A> {
    // choose the new root
    if (left.height < right.height) {
      return new PersistentArray(
        left.index,
        left.height,
        left.value,
        left.left,
        left.right ? PersistentArray.#merge(left.right, right) : right,
      );
    }
    // left.height > right.height, privileges higher numbers.
    return new PersistentArray(
      right.index,
      right.height,
      right.value,
      right.left ? PersistentArray.#merge(left, right.left) : left,
      right.right,
    );
  }

  delete(index: number): PersistentArray<A> | undefined {
    if (PersistentArray.height(index) > this.height) {
      return this;
    }
    if (index < this.index) {
      const left = this.left?.delete(index);
      if (left === this.left) return this;
      return new PersistentArray(
        this.index,
        this.height,
        this.value,
        left,
        this.right,
      );
    }
    if (index === this.index) {
      if (this.left) {
        if (this.right) {
          return PersistentArray.#merge(this.left, this.right);
        }
        return this.left;
      }
      return this.right;
    }
    const right = this.right?.delete(index);
    if (right === this.right) return this;
    return new PersistentArray(
      this.index,
      this.height,
      this.value,
      this.left,
      right,
    );
  }

  *entries(): Generator<[number, A]> {
    if (this.left) {
      yield* this.left.entries();
    }
    yield [this.index, this.value];
    if (this.right) {
      yield* this.right.entries();
    }
  }

  toString(): string {
    const pairs = [];
    for (const [k, v] of this.entries()) {
      pairs.push(`${k}: ${v ? v.toString() : v}`);
    }
    return `{${pairs.join(", ")}}`;
  }
}
