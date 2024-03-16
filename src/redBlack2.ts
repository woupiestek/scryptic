class Empty {
  static readonly _instance = new this();
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
  _add<A>(key: string, value: A): Red<A> {
    return new Red<A>(this, key, value, this);
  }
  add<A>(key: string, value: A): RedBlackTreeMap<A> {
    return new Black<A>(this, key, value, this);
  }
}

type X<A> = [
  Black<A> | Empty,
  string,
  A,
  Black<A> | Empty,
  string,
  A,
  Black<A> | Empty,
];

// deno-lint-ignore no-explicit-any
class NonEmpty<A, B extends NonEmpty<A, any>> {
  readonly _left: B | Empty;
  readonly _key: string;
  readonly _value: A;
  readonly _right: B | Empty;
  constructor(
    left: B | Empty,
    key: string,
    value: A,
    right: B | Empty,
  ) {
    this._left = left;
    this._key = key;
    this._value = value;
    this._right = right;
  }
  get(key: string): A | undefined {
    if (key === this._key) return this._value;
    if (key < this._key) return this._left.get(key);
    if (key > this._key) return this._right.get(key);
  }
  *entries(): Generator<[string, A]> {
    yield* this._left.entries();
    yield [this._key, this._value];
    yield* this._right.entries();
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
}

class Black<A> extends NonEmpty<A, Black<A> | Red<A>> {
  constructor(
    left: Black<A> | Empty | Red<A>,
    key: string,
    value: A,
    right: Black<A> | Empty | Red<A>,
  ) {
    super(left, key, value, right);
  }

  _add<B>(key: string, value: B): Black<A | B> | Red<A | B> {
    if (key === this._key) {
      return new Black<A | B>(this._left, key, value, this._right);
    }
    if (key < this._key) {
      const x = this._left._add(key, value);
      if (x instanceof Array) {
        return new Red(
          new Black(x[0], x[1], x[2], x[3]),
          x[4],
          x[5],
          new Black(x[6], this._key, this._value, this._right),
        );
      }
      return new Black(x, this._key, this._value, this._right);
    }
    // if (key < this.key)
    const x = this._right._add(key, value);
    if (x instanceof Array) {
      return new Red(
        new Black(this._left, this._key, this._value, x[0]),
        x[1],
        x[2],
        new Black(x[3], x[4], x[5], x[6]),
      );
    }
    return new Black(this._left, this._key, this._value, x);
  }

  add<B>(key: string, value: B): RedBlackTreeMap<A | B> {
    const x = this._add(key, value);
    if (x instanceof Black) {
      return x;
    }
    return new Black<A | B>(
      x._left,
      x._key,
      x._value,
      x._right,
    );
  }
}

class Red<A> extends NonEmpty<A, Black<A>> {
  constructor(
    left: Black<A> | Empty,
    key: string,
    value: A,
    right: Black<A> | Empty,
  ) {
    super(left, key, value, right);
  }
  _add<B>(key: string, value: B): Red<A | B> | X<A | B> {
    if (key === this._key) {
      return new Red<A | B>(this._left, key, value, this._right);
    }
    if (key < this._key) {
      const x = this._left._add(key, value);
      if (x instanceof Array) {
        return new Red(
          new Black(x[0], x[1], x[2], x[3]),
          x[4],
          x[5],
          new Black<A | B>(x[6], this._key, this._value, this._right),
        );
      }
      if (x instanceof Red) {
        return [
          x._left,
          x._key,
          x._value,
          x._right,
          this._key,
          this._value,
          this._left,
        ];
      }
      return new Red(x, this._key, this._value, this._right);
    }
    // if (key < this._key)
    const x = this._right._add(key, value);
    if (x instanceof Array) {
      return new Red(
        new Black<A | B>(this._left, this._key, this._value, x[0]),
        x[1],
        x[2],
        new Black(x[3], x[4], x[5], x[6]),
      );
    }
    if (x instanceof Red) {
      return [
        this._right,
        this._key,
        this._value,
        x._left,
        x._key,
        x._value,
        x._right,
      ];
    }
    return new Red(this._left, this._key, this._value, x);
  }
}

export type RedBlackTreeMap<A> = Black<A> | Empty;
export const RedBlackTreeMap = { EMPTY: Empty._instance };
