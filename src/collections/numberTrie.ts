class Leaf<A> {
  readonly index = 0;
  constructor(
    private readonly value: A,
  ) {}
  get(index: number) {
    return index === 0 ? this.value : undefined;
  }
  set<B>(index: number, value: B): NonEmpty<A | B> {
    if (index === 0) {
      if (value === this.value as A | B) return this;
      return new Leaf(value);
    }
    return __set<A | B>(index, value, this);
  }
  __delete(index: number): Leaf<A> | undefined {
    if (index === 0) return;
    return this;
  }
  delete(index: number): NumberTrie<A> {
    return this.__delete(index) || Empty.instance;
  }
  *entries(offset = 0): Generator<[number, A]> {
    yield [offset, this.value];
  }
  toString() {
    return "{" + this.value?.toString() + "}";
  }
}

// assume if zero then index > zero.index
function __set<A>(index: number, value: A, zero?: NonEmpty<A>): NonEmpty<A> {
  if (index === 0) return new Leaf(value);
  let j = zero ? 2 * (zero.index + 1) : 0;
  while (j < index) {
    j = 2 * (j + 1);
  }
  if (j === index) {
    return new Node(j, zero, undefined, value);
  }
  return new Node(j, zero, __set(index - j / 2, value));
}

class Node<A> {
  constructor(
    readonly index: number, // 2, 6, 14, 30, 62, 126, 254, ...
    private readonly zero?: Node<A> | Leaf<A>,
    private readonly one?: Node<A> | Leaf<A>,
    private readonly value?: A,
  ) {}

  get(index: number): A | undefined {
    if (index > this.index) return;
    if (index === this.index) return this.value;
    if (index >= this.index / 2) return this.one?.get(index - this.index / 2);
    return this.zero?.get(index);
  }

  set<B>(index: number, value: B): NonEmpty<A | B> {
    if (index > this.index) {
      return __set<A | B>(index, value, this);
    }
    if (index === this.index) {
      if (value === this.value) return this;
      return new Node<A | B>(this.index, this.zero, this.one, value);
    }
    if (index >= this.index / 2) {
      const j = index - this.index / 2;
      const one = this.one?.set(j, value) || __set<A | B>(j, value, this.one);
      if (one === this.one) return this;
      return new Node<A | B>(
        this.index,
        this.zero,
        one,
        this.value,
      );
    }
    const zero = this.zero?.set(index, value) ||
      __set<A | B>(index, value, this.zero);
    if (zero === this.zero) return this;
    return new Node(this.index, zero, this.one, this.value);
  }

  __delete(index: number): NonEmpty<A> | undefined {
    if (index > this.index) {
      return this;
    }
    if (index === this.index) {
      if (this.zero || this.one) {
        return new Node(
          this.index,
          this.zero,
          this.one,
        );
      }
      return undefined;
    }
    if (index >= this.index / 2) {
      const one = this.one?.__delete(index - this.index / 2);
      if (one === this.one) return this;
      return new Node(
        this.index,
        this.zero,
        one,
        this.value,
      );
    }
    const zero = this.zero?.__delete(index);
    if (zero === this.zero) return this;
    return new Node(this.index, zero, this.one, this.value);
  }

  delete(index: number): NumberTrie<A> {
    return this.__delete(index) || Empty.instance;
  }

  *entries(offset = 0): Generator<[number, A]> {
    if (this.zero) yield* this.zero.entries(offset);
    if (this.one) yield* this.one.entries(offset + this.index / 2);
    if (this.value !== undefined) yield [offset + this.index, this.value];
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
    return __set(index, value);
  }
  delete(_: number): NumberTrie<never> {
    return this;
  }
  *entries(_ = 0): Generator<[number, never]> {}
  toString() {
    return "{}";
  }
}

type NonEmpty<A> = Leaf<A> | Node<A>;
export type NumberTrie<A> = Empty | NonEmpty<A>;
export const NumberTrie = {
  empty<A>() {
    return Empty.instance as NumberTrie<A>;
  },
};
