export class NumberTrie<A> {
  constructor(
    private value?: A,
    private one?: NumberTrie<A>,
    private zero?: NumberTrie<A>,
  ) {}
  get(index: number): A | undefined {
    if (index === 0) return this.value;
    if (index & 1) {
      return this.one?.get((index - 1) / 2);
    }
    return this.zero?.get(index / 2 - 1);
  }
  static singleton<A>(index: number, value: A): NumberTrie<A> {
    if (index === 0) return new NumberTrie(value);
    if (index & 1) {
      return new NumberTrie(
        undefined,
        NumberTrie.singleton((index - 1) / 2, value),
      );
    }
    return new NumberTrie(
      undefined,
      undefined,
      NumberTrie.singleton(index / 2 - 1, value),
    );
  }
  set(index: number, value: A): void {
    if (index === 0) {
      this.value = value;
      return;
    }
    if (index & 1) {
      if (this.one) {
        this.one.set((index - 1) / 2, value);
        return;
      }
      this.one = NumberTrie.singleton((index - 1) / 2, value);
      return;
    }
    if (this.zero) {
      this.zero.set(index / 2 - 1, value);
      return;
    }
    this.zero = NumberTrie.singleton(index / 2 - 1, value);
  }
  delete(index: number): void {
    if (index === 0) {
      this.value = undefined;
      return;
    }
    if (index & 1) {
      if (!this.one) return;
      this.one.delete((index - 1) / 2);
      return;
    }
    if (!this.zero) return;
    this.zero.delete(index / 2 - 1);
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
    const values = this.__values();
    for (let i = 0;; i++) {
      const { value, done } = values.next();
      if (value !== undefined) yield [i, value];
      if (done) return;
    }
  }

  *__values(): Generator<A | undefined> {
    yield this.value;
    yield* interleave(this.one?.__values(), this.zero?.__values());
  }

  toString() {
    const pairs = [];
    for (const [k, v] of this.entries()) {
      pairs.push(k + ": " + v?.toString());
    }
    return "{" + pairs.join(", ") + "}";
  }
}

function* interleave<A>(
  a?: Generator<A | undefined>,
  b?: Generator<A | undefined>,
): Generator<A | undefined> {
  let c = false;
  let moreA = !!a;
  let moreB = !!b;
  while (moreA || moreB) {
    if ((c = !c)) {
      if (!a || !moreA) yield undefined;
      else {
        const { value, done } = a.next();
        moreA &&= !done;
        yield value;
      }
    } else {
      if (!b || !moreB) yield undefined;
      else {
        const { value, done } = b.next();
        moreB &&= !done;
        yield value;
      }
    }
  }
}
