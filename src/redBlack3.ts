class Empty {
  readonly red = false;
  static readonly instance = new this();
  private constructor() {}
  _isBalanced() {
    return true;
  }
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
    return new NonEmpty<A>(true, this, key, value, this);
  }
  removeLeast(): undefined {
    return undefined;
  }
}

class NonEmpty<A> {
  constructor(
    readonly red: boolean,
    readonly left: NonEmpty<A> | Empty,
    readonly key: string,
    readonly value: A,
    readonly right: NonEmpty<A> | Empty,
  ) {}

  _isBalanced() {
    return !(this.red && (this.left.red || this.right.red));
  }

  get(key: string): A | undefined {
    if (key === this.key) return this.value;
    if (key < this.key) return this.left.get(key);
    if (key > this.key) return this.right.get(key);
  }
  *entries(): Generator<[string, A]> {
    if (!(this.left instanceof Empty)) {
      for (const p of this.left.entries()) return p;
    }
    yield [this.key, this.value];
    if (!(this.right instanceof Empty)) {
      for (const p of this.right.entries()) return p;
    }
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
    left: NonEmpty<A | B>,
    key = this.key,
    value = this.value,
  ): NonEmpty<A | B> {
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

  _withRight<B>(right: NonEmpty<A | B>): NonEmpty<A | B> {
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
      const left = this.left._add(key, value);
      if (left._isBalanced()) {
        return new NonEmpty(this.red, left, this.key, this.value, this.right);
      }
      return this._withLeft(left);
    }
    // if (key < this.key)
    const right = this.right._add(key, value);
    if (right._isBalanced()) {
      return new NonEmpty(false, this.left, this.key, this.value, right);
    }
    return this._withRight(right);
  }

  add<B>(key: string, value: B): RedBlackTreeMap<A | B> {
    const x = this._add(key, value);
    // change to color
    return new NonEmpty<A | B>(
      false,
      x.left,
      x.key,
      x.value,
      x.right,
    );
  }

  _removeLeast(): [string, A, RedBlackTreeMap<A>] {
    if (this.left instanceof Empty) {
      return [this.key, this.value, this.right];
    }
    const [k, v, left] = this.left._removeLeast();
    if (left._isBalanced()) {
      return [
        k,
        v,
        new NonEmpty(this.red, left, this.key, this.value, this.right),
      ];
    }
    return [k, v, this._withLeft(left as NonEmpty<A>)];
  }
  removeLeast(): [string, A, RedBlackTreeMap<A>] {
    if (this.left instanceof Empty) {
      return [this.key, this.value, this.right];
    }
    const [k, v, left] = this.left._removeLeast();
    if (left._isBalanced()) {
      return [
        k,
        v,
        new NonEmpty(this.red, left, this.key, this.value, this.right),
      ];
    }
    return [k, v, this._withLeft(left as NonEmpty<A>)];
  }
  _remove(key: string): RedBlackTreeMap<A> {
    if (key < this.key) {
      if (this.left instanceof Empty) return this;
      const left = this.left._remove(key);
      if (!left._isBalanced) {
        return new NonEmpty(this.red, left, this.key, this.value, this.right);
      }
      return this._withLeft<A>(left as NonEmpty<A>);
    }

    if (key > this.key) {
      if (this.right instanceof Empty) return this;
      const right = this.right._remove(key);
      if (right._isBalanced()) {
        return new NonEmpty(this.red, this.left, this.key, this.value, right);
      }
      return this._withLeft(right as NonEmpty<A>);
    }

    // if(key === this.key)
    if (this.left instanceof Empty) {
      return this.right;
    }
    const [k, v, left] = this.left._removeLeast();
    if (left._isBalanced()) {
      return new NonEmpty(this.red, left, k, v, this.right);
    }
    return this._withLeft(left as NonEmpty<A>, k, v);
  }
  remove(key: string): RedBlackTreeMap<A> {
    if (key < this.key) {
      if (this.left instanceof Empty) return this;
      const left = this.left._remove(key);
      if (left._isBalanced()) {
        return new NonEmpty(false, left, this.key, this.value, this.right);
      }
      return this._withLeft(left as NonEmpty<A>);
    }

    if (key > this.key) {
      if (this.right instanceof Empty) return this;
      const right = this.right._remove(key);
      if (right._isBalanced()) {
        return new NonEmpty(false, this.left, this.key, this.value, right);
      }
      return this._withRight(right as NonEmpty<A>);
    }
    // if(key === this.key)
    if (this.left instanceof Empty) {
      return this.right;
    }
    const [k, v, left] = this.left._removeLeast();
    if (left._isBalanced()) {
      return new NonEmpty(false, left, k, v, this.right);
    }
    return this._withLeft(left as NonEmpty<A>, k, v);
  }
}

export type RedBlackTreeMap<A> = NonEmpty<A> | Empty;
export const RedBlackTreeMap = { EMPTY: Empty.instance };
