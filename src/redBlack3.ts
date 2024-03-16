class Empty {
  readonly red = false;
  static readonly instance = new this();
  private constructor() {}
  get(_: string): undefined {
    return undefined;
  }
  // deno-lint-ignore require-yield
  *entries(): Generator<[string, never]> {
    return;
  }
  object(): { [_: string]: never } {
    return {};
  }
  toString(): string {
    return "{}";
  }
  _add<A>(key: string, value: A): NonEmpty<A> {
    return new NonEmpty<A>(true, this, key, value, this);
  }
  add<A>(key: string, value: A): RedBlackTreeMap<A> {
    return new NonEmpty<A>(false, this, key, value, this);
  }
  blacken() {
    return this;
  }
}

class NonEmpty<A> {
  constructor(
    readonly red: boolean,
    private readonly left: NonEmpty<A> | Empty,
    readonly key: string,
    readonly value: A,
    private readonly right: NonEmpty<A> | Empty,
  ) {}

  _isBalanced() {
    return !(this.red && (this.left.red || this.right.red));
  }

  blacken() {
    if (this.red) {
      return new NonEmpty(false, this.left, this.key, this.value, this.right);
    }
    return this;
  }

  static _get<A>(that: RedBlackTreeMap<A>, key: string): A | undefined {
    for (;;) {
      if (that instanceof Empty) return undefined;
      if (that.key === key) return that.value;
      that = key < that.key ? that.left : that.right;
    }
  }

  get(key: string): A | undefined {
    return NonEmpty._get(this, key);
  }

  *entries(): Generator<[string, A]> {
    yield* this.left.entries();
    yield [this.key, this.value];
    yield* this.right.entries();
  }

  object(): { [_: string]: A } {
    const y: { [_: string]: A } = {};
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
    left: RedBlackTreeMap<A | B>,
    key = this.key,
    value = this.value,
  ): NonEmpty<A | B> {
    if (left instanceof Empty || left._isBalanced()) {
      return new NonEmpty(this.red, left, key, value, this.right);
    }
    if (left.right.red) {
      return new NonEmpty(
        false,
        new NonEmpty(
          true,
          left.left,
          left.key,
          left.value,
          left.right.left,
        ),
        left.right.key,
        left.right.value,
        new NonEmpty(
          true,
          left.right.right,
          key,
          value,
          this.right,
        ),
      );
    }
    return new NonEmpty(
      false,
      left.left,
      left.key,
      left.value,
      new NonEmpty(true, left.right, key, value, this.right),
    );
  }

  _withRight<B>(right: RedBlackTreeMap<A | B>): NonEmpty<A | B> {
    if (right instanceof Empty || right._isBalanced()) {
      return new NonEmpty(this.red, this.left, this.key, this.value, right);
    }
    if (right.left.red) {
      // && !right.right.red
      return new NonEmpty(
        false,
        new NonEmpty(true, this.left, this.key, this.value, right.left.left),
        right.left.key,
        right.left.value,
        new NonEmpty(
          true,
          right.left.right,
          right.key,
          right.value,
          right.right,
        ),
      );
    }
    // if(!right.left.red && right.right.red)
    return new NonEmpty(
      false,
      new NonEmpty(true, this.left, this.key, this.value, right.left),
      right.key,
      right.value,
      right.right,
    );
  }

  _add<B>(key: string, value: B): NonEmpty<A | B> {
    if (key === this.key) {
      return new NonEmpty<A | B>(this.red, this.left, key, value, this.right);
    }
    if (key < this.key) {
      return this._withLeft(this.left._add(key, value));
    }
    // if (key < this.key)
    return this._withRight(this.right._add(key, value));
  }

  add<B>(key: string, value: B): RedBlackTreeMap<A | B> {
    return this._add(key, value).blacken();
  }

  static _removeLeast<A>(that: NonEmpty<A>): [string, A, RedBlackTreeMap<A>] {
    const reverse: NonEmpty<A>[] = [];
    while (that.left instanceof NonEmpty) {
      reverse.push(that);
      that = that.left;
    }
    const { key, value } = that;
    let result = that.right;
    while (reverse.length > 0) {
      result = (reverse.pop() as NonEmpty<A>)._withLeft(result);
    }
    return [key, value, result];
  }

  _remove(key: string): RedBlackTreeMap<A> {
    if (key < this.key) {
      if (this.left instanceof Empty) return this;
      return this._withLeft<A>(this.left._remove(key));
    }

    if (key > this.key) {
      if (this.right instanceof Empty) return this;
      return this._withRight(this.right._remove(key));
    }
    // if(key === this.key)
    if (this.left instanceof Empty) {
      return this.right;
    }
    const [k, v, left] = NonEmpty._removeLeast(this.left);
    return this._withLeft(left, k, v);
  }

  remove(key: string): RedBlackTreeMap<A> {
    return this._remove(key).blacken();
  }
}

export type RedBlackTreeMap<A> = NonEmpty<A> | Empty;
export const RedBlackTreeMap = { EMPTY: Empty.instance };
