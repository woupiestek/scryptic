/*
 * right trees store with offset index + 1
 * range of subtrees is limited by index
 */
export class Node<A> {
  private constructor(
    private readonly index: number,
    private readonly value: A,
    private readonly left?: Node<A>,
    private readonly right?: Node<A>,
  ) {
    if (index < 0) throw new Error("that is not supposed to happen");
  }

  static singleton<A>(index: number, value: A): Node<A> {
    return new this(index, value);
  }

  get(index: number): A | undefined {
    if (index < this.index) return this.left?.get(index);
    if (index === this.index) return this.value;
    if (index <= 2 * this.index) return this.right?.get(index - this.index - 1);
    return undefined;
  }

  // keep it simpler with recursion
  // act wierdly anyway: values lost or out of order
  #partition(pivot: number): [Node<A>?, Node<A>?] {
    const { index, value, left, right } = this;
    if (index < pivot) {
      if (!right) {
        return [this, undefined];
      }
      const [l, r] = right.#partition(pivot);
      return [new Node(index, value, left, l), r];
    }
    if (index > pivot) {
      if (!left) {
        return [
          undefined,
          new Node(index - pivot - 1, value, undefined, right),
        ];
      }
      const [l, r] = left.#partition(pivot);
      return [l, new Node(index - pivot - 1, value, r, right)];
    }
    return [left, right];
  }

  set(index: number, value: A): Node<A> {
    if (index > 2 * this.index) {
      return new Node(index, value, this);
    }
    if (index < this.index) {
      if (!this.left) {
        return new Node(
          this.index,
          this.value,
          Node.singleton(index, value),
          this.right,
        );
      }
      const left = this.left.set(index, value);
      if (left === this.left) return this;
      return new Node(this.index, this.value, left, this.right);
    }
    if (index === this.index) {
      if (value === this.value) return this;
      return new Node(index, value, this.left, this.right);
    }
    const j = index - this.index - 1;
    const right = this.right
      ? this.right.set(j, value)
      : Node.singleton(j, value);
    if (right === this.right) return this;
    return new Node(this.index, this.value, this.left, right);
  }

  #deleteRoot(): Node<A> | undefined {
    if (!this.right) return this.left;
    let r = this.right;
    const rs: Node<A>[] = [];
    while (r.left) {
      rs.push(r);
      r = r.left;
    }
    // everything in right is offset by this.index + 1
    let { index, value, right } = r;
    while (rs.length > 0) {
      r = rs.pop() as Node<A>;
      right = new Node(
        r.index - index - 1, // this is the scary part
        r.value,
        right,
        r.right,
      );
    }
    return new Node(this.index + index + 1, value, this.left, right);
  }

  delete(index: number): PersistentArray<A> {
    return this.#delete(index) || Empty.INSTANCE;
  }

  #delete(index: number): Node<A> | undefined {
    if (index > 2 * index) return;
    if (index > this.index) {
      const right = this.right && this.right.#delete(index - this.index - 1);
      if (right === this.right) return this;
      return new Node(
        this.index,
        this.value,
        this.left,
        right,
      );
    }
    if (index < this.index) {
      const left = this.left && this.left.#delete(index);
      if (left === this.left) return this;
      return new Node(
        this.index,
        this.value,
        left,
        this.right,
      );
    }
    // if (index === this.index)
    return this.#deleteRoot();
  }

  *entries(offset = 0): Generator<[number, A]> {
    if (this.left) {
      yield* this.left.entries(offset);
    }
    yield [offset + this.index, this.value];
    if (this.right) {
      yield* this.right.entries(offset + this.index + 1);
    }
  }

  toString(): string {
    const pairs = [];
    for (const [k, v] of this.entries()) {
      pairs.push(`${k}: ${v ? v.toString() : v}`);
    }
    return `{${pairs.join(", ")}}`;
  }

  __depth(): number {
    return Math.max(this.left?.__depth() || 0, this.right?.__depth() || 0) + 1;
  }

  __imbalance() {
    return (this.left?.__depth() || 0) - (this.right?.__depth() || 0);
  }
}

class Empty {
  static INSTANCE = new this();
  private constructor() {}
  get(_: number) {
    return undefined;
  }
  set<A>(index: number, value: A) {
    return Node.singleton(index, value);
  }
  delete(_: number) {
    return this;
  }
  *entries<A>(): Generator<[number, A]> {}
  toString(): string {
    return "{}";
  }
  __depth(): number {
    return 0;
  }
  __imbalance() {
    return 0;
  }
}

export type PersistentArray<A> = Empty | Node<A>;
export const PersistentArray = {
  empty<A>(): PersistentArray<A> {
    return Empty.INSTANCE as PersistentArray<A>;
  },
};
