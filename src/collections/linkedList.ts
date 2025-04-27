class Empty {
  static readonly _instance = new this();
  readonly isEmpty = true;
  private constructor() {}
  // deno-lint-ignore require-yield
  *entries(): Generator<never> {
    return;
  }
  prepend<A>(head: A) {
    return new Cons<A>(head, this);
  }
}
class Cons<A> {
  readonly isEmpty = false;
  constructor(
    readonly head: A,
    readonly tail: LinkedList<A>,
  ) {}
  *entries(): Generator<A> {
    yield this.head;
    yield* this.tail.entries();
  }
  prepend<B>(head: B) {
    return new Cons<A | B>(head, this);
  }
}

export type LinkedList<A> = Cons<A> | Empty;
export const LinkedList = {
  EMPTY: Empty._instance,
  cons<A, B>(head: A, tail: Cons<B>) {
    return new Cons<A | B>(head, tail);
  },
};
