class Node<A> {
  constructor(
    readonly size: number,
    readonly value: A,
    readonly left: Tree<A>,
    readonly right: Tree<A>,
  ) {}

  get(index: number): A | undefined {
    if (index === 0) return this.value;
    if (!this.left) return;
    if (index <= this.left?.size) {
      return this.left?.get(index - 1);
    }
    return this.right?.get(index - 1);
  }
}

class Leaf<A> {
  readonly size = 1;
  constructor(
    readonly value: A,
  ) {}
  get(index: number): A | undefined {
    if (index === 0) return this.value;
    return;
  }
}

type Tree<A> = Node<A> | Leaf<A>;

class RList<A> {
  constructor(
    private readonly tree: Tree<A>,
    readonly length: number,
    private readonly _tail?: RList<A>,
  ) {}

  push(value: A) {
    if (
      this._tail && this._tail._tail &&
      this._tail.tree.size === this._tail._tail.tree.size
    ) {
      return new RList(
        new Node(
          1 + this._tail.tree.size + this._tail._tail.tree.size,
          value,
          this._tail.tree,
          this._tail.tree,
        ),
        1 + this.length,
        this._tail._tail._tail,
      );
    }
    return new RList(
      new Leaf(value),
      1 + this.length,
      this,
    );
  }

  last() {
    return this.tree.value;
  }

  dropLast(): SkewBRAList<A> {
    if (this.tree.size === 1) return this._tail || Empty.INSTANCE;
    const { size, left, right } = this.tree as Node<A>;
    return new RList(
      left,
      this.length - 1,
      new RList(
        right,
        this.length - 1 - size,
        this._tail,
      ),
    );
  }

  truncate(length: number): SkewBRAList<A> {
    if (this.length <= length) return this;
    if (this.tree.size <= length) {
      return (this._tail as RList<A>).truncate(length);
    }
    return this.dropLast().truncate(length);
  }

  get(index: number): A | undefined {
    const j = this.length - index - 1;
    if (j < this.tree.size) {
      return this.tree.get(j);
    } else {
      return this._tail?.get(j - this.tree.size);
    }
  }
}

class Empty {
  readonly length = 0;
  private constructor() {}
  static INSTANCE = new this();
  push<A>(a: A): RList<A> {
    return new RList(new Leaf(a), 1);
  }
  last(): undefined {
    return;
  }
  dropLast() {
    return this;
  }
  truncate(_: number) {
    return this;
  }
  get(_: number): undefined {
    return;
  }
}

export type SkewBRAList<A> = RList<A> | Empty;
export const SkewBRAList = {
  empty<A>(): SkewBRAList<A> {
    return Empty.INSTANCE as SkewBRAList<A>;
  },
};
