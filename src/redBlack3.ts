class Empty {
  readonly red = false;
  static readonly instance = new this();
  private constructor() {}
  get(_: string): undefined {
    return undefined;
  }
  *entries(): Generator<[string, never]> {
  }
  object(): { [_: string]: never } {
    return {};
  }
  toString(): string {
    return "{}";
  }
  _add<A>(index: number, value: A): NonEmpty<A> {
    return new NonEmpty<A>(true, undefined, index, value, undefined);
  }
  add<A>(index: number, value: A): RedBlackTreeMap<A> {
    return new NonEmpty<A>(false, undefined, index, value, undefined);
  }
}

class NonEmpty<A> {
  constructor(
    readonly red: boolean,
    private readonly left: NonEmpty<A> | undefined,
    readonly index: number,
    readonly value: A,
    private readonly right: NonEmpty<A> | undefined,
  ) {}

  _isBalanced() {
    return !(this.red && (this.left?.red || this.right?.red));
  }

  blacken() {
    if (this.red) {
      return new NonEmpty(false, this.left, this.index, this.value, this.right);
    }
    return this;
  }

  static _get<A>(that: NonEmpty<A> | undefined, index: number): A | undefined {
    for (;;) {
      if (!that) return undefined;
      if (that.index === index) return that.value;
      that = index < that.index ? that.left : that.right;
    }
  }

  get(index: number): A | undefined {
    return NonEmpty._get(this, index);
  }

  *entries(): Generator<[number, A]> {
    if (this.left) yield* this.left.entries();
    yield [this.index, this.value];
    if (this.right) yield* this.right.entries();
  }

  object(): { [_: number]: A } {
    const y: { [_: number]: A } = {};
    for (const [k, v] of this.entries()) {
      y[k] = v;
    }
    return y;
  }

  toString(): string {
    const y: string[] = [];
    for (const [k, v] of this.entries()) {
      y.push(`${k}: ${v}`);
    }
    return `{${y.join(", ")}}`;
  }

  _withLeft<B>(
    left: NonEmpty<A | B> | undefined,
    index = this.index,
    value = this.value,
  ): NonEmpty<A | B> {
    if (!left || left._isBalanced()) {
      return new NonEmpty(this.red, left, index, value, this.right);
    }
    if (left.right?.red) {
      return new NonEmpty(
        false,
        new NonEmpty(
          true,
          left.left,
          left.index,
          left.value,
          left.right.left,
        ),
        left.right.index,
        left.right.value,
        new NonEmpty(
          true,
          left.right.right,
          index,
          value,
          this.right,
        ),
      );
    }
    return new NonEmpty(
      false,
      left.left,
      left.index,
      left.value,
      new NonEmpty(true, left.right, index, value, this.right),
    );
  }

  _withRight<B>(right: NonEmpty<A | B> | undefined): NonEmpty<A | B> {
    if (!right || right._isBalanced()) {
      return new NonEmpty(this.red, this.left, this.index, this.value, right);
    }
    if (right.left?.red) {
      // && !right.right.red
      return new NonEmpty(
        false,
        new NonEmpty(true, this.left, this.index, this.value, right.left.left),
        right.left.index,
        right.left.value,
        new NonEmpty(
          true,
          right.left.right,
          right.index,
          right.value,
          right.right,
        ),
      );
    }
    // if(!right.left.red && right.right.red)
    return new NonEmpty(
      false,
      new NonEmpty(true, this.left, this.index, this.value, right.left),
      right.index,
      right.value,
      right.right,
    );
  }

  static _leaf<B>(index: number, value: B) {
    return new NonEmpty(true, undefined, index, value, undefined);
  }

  _add<B>(index: number, value: B): NonEmpty<A | B> {
    if (index === this.index) {
      return new NonEmpty<A | B>(this.red, this.left, index, value, this.right);
    }
    if (index < this.index) {
      return this._withLeft(
        this.left ? this.left._add(index, value) : NonEmpty._leaf(index, value),
      );
    }
    // if (index > this.index)
    return this._withRight(
      this.right ? this.right._add(index, value) : NonEmpty._leaf(index, value),
    );
  }

  add<B>(index: number, value: B): RedBlackTreeMap<A | B> {
    return this._add(index, value).blacken();
  }

  static _removeLeast<A>(that: NonEmpty<A>): [number, A, NonEmpty<A>?] {
    const reverse: NonEmpty<A>[] = [];
    while (that.left) {
      reverse.push(that);
      that = that.left;
    }
    const { index, value } = that;
    let result = that.right;
    while (reverse.length > 0) {
      result = (reverse.pop() as NonEmpty<A>)._withLeft(result);
    }
    return [index, value, result];
  }

  _remove(index: number): NonEmpty<A> | undefined {
    if (index < this.index) {
      if (!this.left) return this;
      return this._withLeft<A>(this.left?._remove(index));
    }

    if (index > this.index) {
      if (!this.right) return this;
      return this._withRight(this.right?._remove(index));
    }
    // if(index === this.index)
    if (!this.left) {
      return this.right;
    }
    const [k, v, left] = NonEmpty._removeLeast(this.left);
    return this._withLeft(left, k, v);
  }

  remove(index: number): RedBlackTreeMap<A> {
    return this._remove(index)?.blacken() || Empty.instance;
  }
}

export type RedBlackTreeMap<A> = NonEmpty<A> | Empty;
export const RedBlackTreeMap = { EMPTY: Empty.instance };
