class Node<A> {
  private constructor(
    readonly index: number,
    private readonly value?: A,
    private readonly zero?: Node<A>,
    private readonly one?: Node<A>,
    private readonly two?: A,
  ) {}

  get(index: number): A | undefined {
    if (index > 2 * this.index) return;
    if (index === 2 * this.index && index !== 0) return this.two;
    if (index > this.index) return this.one?.get(index - this.index - 1);
    if (index === this.index) {
      return this.value;
    }
    return this.zero?.get(index);
  }

  static #set<A, B>(index: number, value: A, left?: Node<B>): Node<A | B> {
    let j = left ? 2 * left.index + 1 : 0;
    while (2 * j < index) {
      j = 2 * j + 1;
    }
    if (j === index) {
      return new Node<A | B>(j, value, left);
    }
    if (2 * j === index && index !== 0) {
      return new Node<A | B>(j, undefined, left, undefined, value);
    }
    return new Node(j, undefined, left, Node.#set(index - j - 1, value));
  }

  set<B>(index: number, value: B): Node<A | B> {
    if (index > 2 * this.index) {
      return Node.#set(index, value, this);
    }
    if (index === 2 * this.index && index !== 0) {
      return new Node<A | B>(
        this.index,
        this.value,
        this.zero,
        this.one,
        value,
      );
    }
    if (index > this.index) {
      const j = index - this.index - 1;
      return new Node(
        this.index,
        this.value,
        this.zero,
        this.one?.set(j, value) ||
          Node.#set(j, value),
        this.two,
      );
    }
    if (index === this.index) {
      return new Node<A | B>(this.index, value, this.zero, this.one, this.two);
    }
    return new Node(
      this.index,
      this.value,
      this.zero?.set(index, value) || Node.#set(index, value),
      this.one,
      this.two,
    );
  }

  #delete(index: number): Node<A> | undefined {
    if (index > 2 * this.index) {
      return this;
    }
    if (index === 2 * this.index && index !== 0) {
      if (this.zero || this.one || this.value !== undefined) {
        return new Node(
          this.index,
          this.value,
          this.zero,
          this.one,
        );
      }
      return undefined;
    }
    if (index > this.index) {
      if (this.one) {
        return new Node(
          this.index,
          this.value,
          this.zero,
          this.one.#delete(index - this.index - 1),
          this.two,
        );
      }
      return this;
    }
    if (index === this.index) {
      if (this.zero || this.one || this.two !== undefined) {
        return new Node(this.index, undefined, this.zero, this.one, this.two);
      }
      return undefined;
    }
    if (this.zero) {
      return new Node(
        this.index,
        this.value,
        this.zero.#delete(index),
        this.one,
        this.two,
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
    if (this.zero) yield* this.zero.entries(offset);
    if (this.value !== undefined) yield [offset + this.index, this.value];
    if (this.one) yield* this.one.entries(offset + this.index + 1);
    if (this.two !== undefined) yield [offset + 2 * this.index, this.two];
  }

  toString() {
    const pairs = [];
    for (const [k, v] of this.entries()) {
      pairs.push(k + ": " + v?.toString());
    }
    return "{" + pairs.join(", ") + "}";
  }
}

class Empty {
  private constructor() {}
  static instance = new this();
  get(_: number): undefined {}
  set<A>(index: number, value: A): NumberTrie<A> {
    return Node.singleton(index, value);
  }
  delete(_: number): NumberTrie<never> {
    return this;
  }
  *entries(_ = 0): Generator<[number, never]> {}
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
