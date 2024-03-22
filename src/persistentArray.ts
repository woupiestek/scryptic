class Node<A> {
  private constructor(
    readonly index: number,
    readonly left?: Node<A>,
    readonly right?: Node<A>,
    readonly value?: A,
  ) {}

  static make<A>(
    left: Tree<A>,
    index: number,
    right?: Node<A>,
    value?: A,
  ): Tree<A> {
    // tombstone removal
    if (
      value === undefined && left === undefined && right === undefined
    ) return undefined;
    return new Node(index, left, right, value);
  }
  withLeft(left: Tree<A>): Tree<A> {
    return this.withLeftRight(left, this.right);
  }
  withRight(right: Tree<A>): Tree<A> {
    return this.withLeftRight(this.left, right);
  }
  withLeftRight(left: Tree<A>, right: Tree<A>): Tree<A> {
    return Node.make(left, this.index, right, this.value);
  }
}

type Tree<A> = undefined | Node<A>;

function partition<A>(
  pivot: number,
  tree: Tree<A>,
): Tree<A> {
  if (tree === undefined) {
    return undefined;
  }
  // avoid reconstruction in trivial cases
  if (tree.index < pivot && tree.right === undefined) {
    return Node.make(tree, pivot, undefined);
  }
  if (tree.index > pivot && tree.left === undefined) {
    return Node.make(undefined, pivot, tree);
  }

  let { index, left, right, value } = tree;
  for (;;) {
    if (index < pivot) {
      if (right === undefined) {
        return Node.make(
          Node.make(left, index, undefined, value),
          pivot,
          undefined,
        );
      }
      if (right.index > pivot) {
        // avoid endless loop
        if (right.left === undefined) {
          return Node.make(
            Node.make(left, index, undefined, value),
            pivot,
            right,
          );
        }
        left = Node.make(left, index, right.left.left, value);
        index = right.left.index;
        value = right.left.value;
        right = right.withLeft(right.left.right);
        continue;
      }
      left = Node.make(left, index, right.left, value);
      index = right.index;
      value = right.value;
      right = right.right;
      continue;
    }
    if (index > pivot) {
      if (left === undefined) {
        return Node.make(
          undefined,
          pivot,
          Node.make(undefined, index, right, value),
        );
      }
      if (left.index < pivot) {
        // avoid endless loop
        if (left.right === undefined) {
          return Node.make(
            left,
            pivot,
            Node.make(undefined, index, right, value),
          );
        }
        right = Node.make(left.right.right, index, right, value);
        index = left.right.index;
        value = left.right.value;
        left = left.withRight(left.right.left);
        continue;
      }
      right = Node.make(left.right, index, right, value);
      index = left.index;
      value = left.value;
      left = left.left;
      continue;
    }
    // if (key === pivot)
    return Node.make(left, pivot, right, value);
  }
}

function merge<A>(left: Tree<A>, right: Tree<A>): Tree<A> {
  if (right === undefined) return left;
  left = partition(right.index, left);
  if (left === undefined) return right;
  return right.withLeftRight(
    merge(left.left, right.left),
    merge(left.right, right.right),
  );
}

function* entries<A>(tree: Tree<A>): Generator<[number, A]> {
  if (tree === undefined) return;
  yield* entries(tree.left);
  if (tree.value !== undefined) yield [tree.index, tree.value];
  yield* entries(tree.right);
}

export class PersistentArray<A> {
  static empty<A>(): PersistentArray<A> {
    return new PersistentArray(undefined);
  }
  private constructor(
    private tree: Tree<A>,
  ) {}
  set<B>(key: number, value?: B): PersistentArray<A | B> {
    this.tree = partition(key, this.tree);
    if (this.tree?.value === value) {
      return this;
    }
    return new PersistentArray(
      Node.make<A | B>(this.tree?.left, key, this.tree?.right, value),
    );
  }
  get(key: number): A | undefined {
    this.tree = partition(key, this.tree);
    if (this.tree !== undefined) {
      return this.tree.value;
    }
  }
  merge(that: PersistentArray<A>): PersistentArray<A> {
    return new PersistentArray(merge(this.tree, that.tree));
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
