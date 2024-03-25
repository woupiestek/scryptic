class Node<A> {
  private constructor(
    readonly index: number,
    private readonly value?: A,
    private readonly left?: Node<A>,
    private readonly right?: Node<A>,
  ) {}

  get(index: number): A | undefined {
    if (index > 2 * this.index) return;
    if (index > this.index) return this.right?.get(index - this.index - 1);
    if (index === this.index) {
      return this.value;
    }
    return this.left?.get(index);
  }

  static #set<A>(index: number, value: A, left?: Node<A>): Node<A> {
    let j = left ? 2 * left.index + 1 : 0;
    while (2 * j < index) {
      j = 2 * j + 1;
    }
    if (j === index) {
      return new Node(index, value, left);
    }
    return new Node(j, undefined, left, Node.#set(index - j - 1, value));
  }

  set(index: number, value: A): Node<A> {
    if (index > 2 * this.index) {
      return Node.#set(index, value, this);
    }
    if (index > this.index) {
      const j = index - this.index - 1;
      return new Node(
        this.index,
        this.value,
        this.left,
        this.right?.set(j, value) ||
          Node.#set(j, value),
      );
    }
    if (index === this.index) {
      return new Node(this.index, value, this.left, this.right);
    }
    return new Node(
      this.index,
      this.value,
      this.left?.set(index, value) || Node.#set(index, value),
      this.right,
    );
  }

  #delete(index: number): Node<A> | undefined {
    if (index > 2 * this.index) {
      return this;
    }
    if (index > this.index) {
      if (this.right) {
        return new Node(
          this.index,
          this.value,
          this.left,
          this.right.#delete(index - this.index - 1),
        );
      }
      return this;
    }
    if (index === this.index) {
      if (this.left || this.right) {
        return new Node(this.index, undefined, this.left, this.right);
      }
      return undefined;
    }
    if (this.left) {
      return new Node(
        this.index,
        this.value,
        this.left.#delete(index),
        this.right,
      );
    }
    return this;
  }

  delete(index: number): NumberTrie<A> {
    return this.#delete(index) || Empty.instance;
  }

  static singleton<A>(index: number, value: A): Node<A> {
    return Node.#set(index, value);
  }

  *entries(offset = 0): Generator<[number, A]> {
    if (this.left) yield* this.left.entries(offset);
    if (this.value !== undefined) yield [offset + this.index, this.value];
    if (this.right) yield* this.right.entries(offset + this.index + 1);
  }

  toString() {
    const pairs = [];
    for (const [k, v] of this.entries()) {
      pairs.push(k + ": " + v);
    }
    return "{" + pairs.join(", ") + "}";
  }
}

class Empty {
  private constructor() {}
  static instance = new this();
  get(_: number) {}
  set<A>(index: number, value: A) {
    return Node.singleton(index, value);
  }
  delete<A>(_: number): NumberTrie<A> {
    return this;
  }
  *entries<A>(_ = 0): Generator<[number, A]> {}
  toString() {
    return "{}";
  }
}

export type NumberTrie<A> = Node<A> | Empty;
export const NumberTrie = {
  empty<A>() {
    return Empty.instance as NumberTrie<A>;
  },
};
