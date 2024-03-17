class Empty {
  static readonly INSTANCE = new this();
  private constructor() {}
}

class NonEmpty<A> {
  constructor(
    readonly left: Tree<A>,
    readonly key: string,
    readonly value: A,
    readonly right: Tree<A>,
  ) {}
  withLeft(left: Tree<A>): NonEmpty<A> {
    return this.withLeftRight(left, this.right);
  }
  withRight(right: Tree<A>): NonEmpty<A> {
    return this.withLeftRight(this.left, right);
  }
  withLeftRight(left: Tree<A>, right: Tree<A>): NonEmpty<A> {
    return new NonEmpty(left, this.key, this.value, right);
  }
}

type Tree<A> = Empty | NonEmpty<A>;

function rotate<A>(tree: NonEmpty<A>, pivot: string): NonEmpty<A> {
  // avoid reconstruction in trivial cases
  if (
    tree.key === pivot || (tree.key < pivot && tree.right instanceof Empty) ||
    tree.key > pivot && tree.left instanceof Empty
  ) return tree;

  let { left, key, value, right } = tree;
  for (;;) {
    if (key < pivot && right instanceof NonEmpty) {
      if (right.key > pivot) {
        // avoid endless loop
        if (right.left instanceof Empty) {
          return new NonEmpty(left, key, value, right);
        }
        left = new NonEmpty(left, key, value, right.left.left);
        key = right.left.key;
        value = right.left.value;
        right = right.withLeft(right.left.right);
        continue;
      }
      left = new NonEmpty(left, key, value, right.left);
      key = right.key;
      value = right.value;
      right = right.right;
      continue;
    }
    if (key > pivot && left instanceof NonEmpty) {
      if (left.key < pivot) {
        // avoid endless loop
        if (left.right instanceof Empty) {
          return new NonEmpty(left, key, value, right);
        }
        right = new NonEmpty(left.right.right, key, value, right);
        key = left.right.key;
        value = left.right.value;
        left = left.withRight(left.right.left);
        continue;
      }
      right = new NonEmpty(left.right, key, value, right);
      key = left.key;
      value = left.value;
      left = left.left;
      continue;
    }
    // if (key === pivot)
    return new NonEmpty(left, key, value, right);
  }
}

function partition<A>(
  pivot: string,
  tree: NonEmpty<A>,
): [Tree<A>, Tree<A>] {
  // avoid reconstruction in trivial cases
  if (tree.key < pivot && tree.right instanceof Empty) {
    return [tree, tree.right];
  }
  if (tree.key > pivot && tree.left instanceof Empty) return [tree.left, tree];

  let { key, left, right, value } = tree;
  for (;;) {
    if (key < pivot) {
      if (right instanceof Empty) {
        return [new NonEmpty(left, key, value, right), right];
      }
      if (right.key > pivot) {
        // avoid endless loop
        if (right.left instanceof Empty) {
          return [new NonEmpty(left, key, value, right.left), right];
        }
        left = new NonEmpty(left, key, value, right.left.left);
        key = right.left.key;
        value = right.left.value;
        right = right.withLeft(right.left.right);
        continue;
      }
      left = new NonEmpty(left, key, value, right.left);
      key = right.key;
      value = right.value;
      right = right.right;
      continue;
    }
    if (key > pivot) {
      if (left instanceof Empty) {
        return [left, new NonEmpty(left, key, value, right)];
      }
      if (left.key < pivot) {
        // avoid endless loop
        if (left.right instanceof Empty) {
          return [left, new NonEmpty(left.right, key, value, right)];
        }
        right = new NonEmpty(left.right.right, key, value, right);
        key = left.right.key;
        value = left.right.value;
        left = left.withRight(left.right.left);
        continue;
      }
      right = new NonEmpty(left.right, key, value, right);
      key = left.key;
      value = left.value;
      left = left.left;
      continue;
    }
    // if (key === pivot)
    return [left, right];
  }
}

function deleteMin<A>(tree: NonEmpty<A>): [string, A, Tree<A>] {
  const path = [];
  while (tree.left instanceof NonEmpty) {
    path.push(tree);
    tree = tree.left;
  }
  const { key, value } = tree;
  let left = tree.right;
  while (path.length > 0) {
    left = (path.pop() as NonEmpty<A>).withLeft(left);
  }
  return [key, value, left];
}

function merge<A, B>(left: Tree<A>, right: Tree<B>): Tree<A | B> {
  if (right instanceof Empty) return left;
  if (left instanceof Empty) return right;
  const [small, big] = partition(right.key, left);
  return right.withLeftRight(
    merge(small, right.left),
    merge(big, right.right),
  );
}

function* entries<A>(tree: Tree<A>): Generator<[string, A]> {
  if (tree instanceof Empty) return;
  yield* entries(tree.left);
  yield [tree.key, tree.value];
  yield* entries(tree.right);
}

export class SplayMap<A> {
  static empty<A>(): SplayMap<A> {
    return new SplayMap(Empty.INSTANCE);
  }
  private constructor(
    private tree: Tree<A>,
  ) {}
  delete(key: string): SplayMap<A> {
    if (this.tree instanceof Empty) return this;
    const [small, big] = partition(key, this.tree);
    if (big instanceof Empty) {
      return new SplayMap(small);
    }
    const [_key, _value, right] = deleteMin(big);
    return new SplayMap(new NonEmpty(small, _key, _value, right));
  }
  insert<B>(key: string, value: B): SplayMap<A | B> {
    if (this.tree instanceof Empty) {
      return new SplayMap(new NonEmpty(this.tree, key, value, this.tree));
    }
    const [small, big] = partition(key, this.tree);
    return new SplayMap(new NonEmpty<A | B>(small, key, value, big));
  }
  select(key: string): A | undefined {
    if (this.tree instanceof Empty) return undefined;
    const t = this.tree = rotate(this.tree, key);
    if (t.key === key) return t.value;
  }
  merge<B>(that: SplayMap<B>): SplayMap<A | B> {
    return new SplayMap(merge(this.tree, that.tree));
  }
  *entries() {
    yield* entries(this.tree);
  }
  toString() {
    const ps: string[] = [];
    for (const [k, v] of entries(this.tree)) {
      ps.push(`${k}: ${v?.toString() || v}`);
    }
    return `{${ps.join(", ")}}`;
  }
}
