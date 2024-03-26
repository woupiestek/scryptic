class Node<A> {
  constructor(
    private readonly value?: A,
    private one?: Node<A>,
    private zero?: Node<A>,
  ) {}
  get(index: number): A | undefined {
    if (index === 0) return this.value;
    if (index & 1) {
      return this.one?.get((index - 1) / 2);
    }
    return this.zero?.get(index / 2 - 1);
  }
  static singleton<A>(index: number, value: A): Node<A> {
    if (index === 0) return new Node(value);
    if (index & 1) {
      return new Node(undefined, Node.singleton((index - 1) / 2, value));
    }
    return new Node(
      undefined,
      undefined,
      Node.singleton(index / 2 - 1, value),
    );
  }
  set<B>(index: number, value: B): Node<A | B> {
    if (index === 0) {
      if (value === this.value) return this;
      return new Node<A | B>(value, this.one, this.zero);
    }
    if (index & 1) {
      if (this.one) {
        const one = this.one.set((index - 1) / 2, value);
        if (one === this.one) return this;
        return new Node(this.value, one, this.zero);
      }
      return new Node(
        this.value,
        Node.singleton<A | B>((index - 1) / 2, value),
        this.zero,
      );
    }
    if (this.zero) {
      const zero = this.zero.set(index / 2 - 1, value);
      if (zero === this.zero) return this;
      return new Node(this.value, this.one, zero);
    }
    return new Node(
      this.value,
      this.one,
      Node.singleton<A | B>(index / 2 - 1, value),
    );
  }
  delete(index: number): NumberTrie<A> {
    return this.#delete(index) || Empty.instance;
  }
  #delete(index: number): Node<A> | undefined {
    if (index === 0) {
      if (this.one || this.zero) {
        return new Node(undefined, this.one, this.zero);
      }
      return;
    }
    if (index & 1) {
      if (!this.one) return this;
      const one = this.one.#delete((index - 1) / 2);
      if (one === this.one) return this;
      if (this.value !== undefined || one || this.zero) {
        return new Node(this.value, one, this.zero);
      }
      return;
    }
    if (!this.zero) return this;
    const zero = this.zero.#delete(index / 2 - 1);
    if (zero === this.zero) return this;
    if (this.value !== undefined || this.one || zero) {
      return new Node(this.value, this.one, zero);
    }
    return;
  }

  //         0
  //     1         2
  //  3    5    4     6
  // 7 11 9 13 8 12 10 14
  //                  0
  //         1                 2
  //    10       12       11       20
  // 100  111 102  120 101  112 110  200

  *entries(): Generator<[number, A]> {
    let i = 0;
    let stream: Stream<A | undefined> | undefined = this.__stream();
    while (stream) {
      if (stream.head !== undefined) yield [i, stream.head];
      i++;
      stream = stream.tail();
    }
  }

  toString() {
    const pairs = [];
    for (const [k, v] of this.entries()) {
      pairs.push(k + ": " + v?.toString());
    }
    return "{" + pairs.join(", ") + "}";
  }

  __stream(): Stream<A> {
    return {
      head: this.value,
      tail: () => interleave(this.one?.__stream(), this.zero?.__stream()),
    };
  }
}

// stream
type Stream<A> = {
  head?: A;
  tail: () => Stream<A> | undefined;
};

function interleave<A>(
  a?: Stream<A>,
  b?: Stream<A>,
): Stream<A> | undefined {
  if (!a && !b) return undefined;
  return {
    head: a?.head,
    tail: () => ({
      head: b?.head,
      tail: () => interleave(a?.tail(), b?.tail()),
    }),
  };
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
  *entries(): Generator<[number, never]> {}
  toString() {
    return "{}";
  }
}

export type NumberTrie<A> = Empty | Node<A>;
export const NumberTrie = {
  empty<A>() {
    return Empty.instance as NumberTrie<A>;
  },
};
