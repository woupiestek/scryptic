// numbers as indices
// mutable
// use this for the string and value tries

type Node<A> = {
  index: number;
  value?: A;
  left?: Node<A>;
  right?: Node<A>;
};

function rotate<A>(that: Node<A>, pivot: number): Node<A> {
  if (pivot > that.index) {
    if (!that.right) {
      return { index: pivot, left: that };
    }
    const right = rotate(that.right, pivot);
    that.right = right.left;
    right.left = that;
    return right;
  }
  if (pivot < that.index) {
    if (!that.left) {
      return { index: pivot, right: that };
    }
    const left = rotate(that.left, pivot);
    that.left = left.right;
    left.right = that;
    return left;
  }
  return that;
}

function* entries<A>(node: Node<A>): Generator<[number, A]> {
  if (node.left) yield* entries(node.left);
  if (node.value !== undefined) yield [node.index, node.value];
  if (node.right) yield* entries(node.right);
}

export class SplayMap<A> {
  private node: Node<A> = { index: 0 };
  get(index: number) {
    this.node = rotate(this.node, index);
    return this.node.value;
  }
  set(index: number, value: A) {
    this.node = rotate(this.node, index);
    this.node.value = value;
  }
  delete(index: number) {
    this.node = rotate(this.node, index);
    delete this.node.value;
  }
  *entries() {
    yield* entries(this.node);
  }
}
