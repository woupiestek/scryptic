class NonEmpty<A> {
  private constructor(
    readonly left: Tree<A>,
    readonly key: string,
    readonly right: Tree<A>,
    readonly value?: A,
  ) {}

  static make<A>(
    left: Tree<A>,
    key: string,
    right: Tree<A>,
    value?: A,
  ): Tree<A> {
    // tombstone removal
    if (
      value === undefined && left === undefined && right === undefined
    ) return undefined;
    return new NonEmpty(left, key, right, value);
  }
  withLeft(left: Tree<A>): Tree<A> {
    return this.withLeftRight(left, this.right);
  }
  withRight(right: Tree<A>): Tree<A> {
    return this.withLeftRight(this.left, right);
  }
  withLeftRight(left: Tree<A>, right: Tree<A>): Tree<A> {
    return NonEmpty.make(left, this.key, right, this.value);
  }
}

type Tree<A> = undefined | NonEmpty<A>;

function partition<A>(
  pivot: string,
  tree: Tree<A>,
): Tree<A> {
  if (tree === undefined) {
    return undefined;
  }
  // avoid reconstruction in trivial cases
  if (tree.key < pivot && tree.right === undefined) {
    return NonEmpty.make(tree, pivot, undefined);
  }
  if (tree.key > pivot && tree.left === undefined) {
    return NonEmpty.make(undefined, pivot, tree);
  }

  let { key, left, right, value } = tree;
  for (;;) {
    if (key < pivot) {
      if (right === undefined) {
        return NonEmpty.make(
          NonEmpty.make(left, key, undefined, value),
          pivot,
          undefined,
        );
      }
      if (right.key > pivot) {
        // avoid endless loop
        if (right.left === undefined) {
          return NonEmpty.make(
            NonEmpty.make(left, key, undefined, value),
            pivot,
            right,
          );
        }
        left = NonEmpty.make(left, key, right.left.left, value);
        key = right.left.key;
        value = right.left.value;
        right = right.withLeft(right.left.right);
        continue;
      }
      left = NonEmpty.make(left, key, right.left, value);
      key = right.key;
      value = right.value;
      right = right.right;
      continue;
    }
    if (key > pivot) {
      if (left === undefined) {
        return NonEmpty.make(
          undefined,
          pivot,
          NonEmpty.make(undefined, key, right, value),
        );
      }
      if (left.key < pivot) {
        // avoid endless loop
        if (left.right === undefined) {
          return NonEmpty.make(
            left,
            pivot,
            NonEmpty.make(undefined, key, right, value),
          );
        }
        right = NonEmpty.make(left.right.right, key, right, value);
        key = left.right.key;
        value = left.right.value;
        left = left.withRight(left.right.left);
        continue;
      }
      right = NonEmpty.make(left.right, key, right, value);
      key = left.key;
      value = left.value;
      left = left.left;
      continue;
    }
    // if (key === pivot)
    return NonEmpty.make(left, pivot, right, value);
  }
}

function merge<A>(left: Tree<A>, right: Tree<A>): Tree<A> {
  if (right === undefined) return left;
  left = partition(right.key, left);
  if (left === undefined) return right;
  return right.withLeftRight(
    merge(left.left, right.left),
    merge(left.right, right.right),
  );
}

function* entries<A>(tree: Tree<A>): Generator<[string, A]> {
  if (tree === undefined) return;
  yield* entries(tree.left);
  if (tree.value !== undefined) yield [tree.key, tree.value];
  yield* entries(tree.right);
}

export class SplayMap<A> {
  static empty<A>(): SplayMap<A> {
    return new SplayMap(undefined);
  }
  private constructor(
    private tree: Tree<A>,
  ) {}
  delete(key: string): SplayMap<A> {
    return this.insert(key);
  }
  insert<B>(key: string, value?: B): SplayMap<A | B> {
    this.tree = partition(key, this.tree);
    if (this.tree?.value === value) {
      return this;
    }
    return new SplayMap(
      NonEmpty.make<A | B>(this.tree?.left, key, this.tree?.right, value),
    );
  }
  select(key: string): A | undefined {
    this.tree = partition(key, this.tree);
    if (this.tree !== undefined) {
      return this.tree.value;
    }
  }
  merge(that: SplayMap<A>): SplayMap<A> {
    return new SplayMap(merge(this.tree, that.tree));
  }
  *entries() {
    yield* entries(this.tree);
  }
  toString() {
    const ps: string[] = [];
    for (const [k, v] of entries(this.tree)) {
      ps.push(`${k}: ${v ? v.toString() : v}`);
    }
    return `{${ps.join(", ")}}`;
  }
}
