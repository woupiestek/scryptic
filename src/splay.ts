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
}

type Tree<A> = Empty | NonEmpty<A>;

function partition<A>(key: string, tree: Tree<A>): [Tree<A>, Tree<A>, A?] {
  if (tree instanceof Empty) return [tree, tree];
  const { left, right } = tree;
  if (tree.key === key) return [left, right, tree.value];
  if (tree.key < key) {
    if (right instanceof Empty) return [tree, right];
    if (right.key <= key) {
      const [small, big, value] = partition(key, right.right);
      return [
        new NonEmpty(
          new NonEmpty(left, tree.key, tree.value, right.left),
          right.key,
          right.value,
          small,
        ),
        big,
        value,
      ];
    }
    const [small, big, value] = partition(key, right.left);
    return [
      new NonEmpty(left, tree.key, tree.value, small),
      new NonEmpty(big, right.key, right.value, right.right),
      value,
    ];
  }
  if (left instanceof Empty) return [left, tree];
  if (left.key <= key) {
    const [small, big, value] = partition(key, left.right);
    return [
      new NonEmpty(left.left, left.key, left.value, small),
      new NonEmpty(big, tree.key, tree.value, right),
      value,
    ];
  }
  const [small, big, value] = partition(key, left.left);
  return [
    small,
    new NonEmpty(
      big,
      left.key,
      left.value,
      new NonEmpty(left.right, tree.key, tree.value, right),
    ),
    value,
  ];
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
    const { key, value, right } = path.pop() as NonEmpty<A>;
    left = new NonEmpty(left, key, value, right);
  }
  return [key, value, left];
}

function* entries<A>(tree: Tree<A>): Generator<[string, A]> {
  if (tree instanceof Empty) return;
  yield* entries(tree.left);
  yield [tree.key, tree.value];
  yield* entries(tree.right);
}

export class SplayMap<A> {
  static readonly EMPTY = new this(Empty.INSTANCE);
  private constructor(
    private tree: Tree<A>,
  ) {}
  delete(key: string): SplayMap<A> {
    const [small, big] = partition(key, this.tree);
    if (big instanceof Empty) {
      return new SplayMap(small);
    }
    const [_key, _value, right] = deleteMin(big);
    return new SplayMap(new NonEmpty(small, _key, _value, right));
  }
  insert<B>(key: string, value: B): SplayMap<A | B> {
    const [small, big] = partition(key, this.tree);
    return new SplayMap(new NonEmpty<A | B>(small, key, value, big));
  }
  select(key: string): A | undefined {
    if (this.tree instanceof Empty) return undefined;
    if (this.tree.key === key) return this.tree.value;
    const [small, big, value] = partition(key, this.tree);
    this.tree = new NonEmpty(small, key, value, big);
    return value;
  }
  *entries() {
    yield* entries(this.tree);
  }
  toString() {
    const ps: string[] = [];
    for (const [k, v] of entries(this.tree)) {
      ps.push(`${k}: ${v}`);
    }
    return `{${ps.join(", ")}}`;
  }
}
