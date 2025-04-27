type Node<A> = {
  index: number;
  priority: number;
  value: A;
  left?: Node<A>;
  right?: Node<A>;
};

// maybe this finally does what I initially intended
export class Treap<A> {
  private node?: Node<A>;

  static #get<A>(node: Node<A>, index: number): A | undefined {
    if (index > node.index) {
      if (!node.right) return;
      return Treap.#get(node.right, index);
    }
    if (index < node.index) {
      if (!node.left) return;
      return Treap.#get(node.left, index);
    }
    return node.value;
  }
  get(index: number) {
    if (!this.node) return;
    return Treap.#get(this.node, index);
  }

  // instead of random assignment of priority
  static #priority(index: number): number {
    let prio = 0;
    while ((index & 1) === 1) {
      prio++;
      index >>> 1;
    }
    return prio;
  }

  static #set<A>(node: Node<A>, index: number, value: A): Node<A> {
    if (index > node.index) {
      if (!node.right) {
        node.right = { index, value, priority: Treap.#priority(index) };
      }
      node.right = Treap.#set(node.right, index, value);
      if (node.priority < node.right.priority) {
        const right = node.right;
        node.right = right.left;
        right.left = node;
        return right;
      }
      return node;
    }
    if (index < node.index) {
      if (!node.left) {
        node.left = { index, value, priority: Treap.#priority(index) };
      }
      node.left = Treap.#set(node.left, index, value);
      if (node.priority < node.left.priority) {
        const left = node.left;
        node.left = left.right;
        left.right = node;
        return left;
      }
      return node;
    }
    node.value = value;
    return node;
  }

  set(index: number, value: A) {
    if (!this.node) {
      this.node = { index, value, priority: Treap.#priority(index) };
    }
    this.node = Treap.#set(this.node, index, value);
  }

  static #deleteRoot<A>(node: Node<A>): Node<A> | undefined {
    if (!node.right) return node.left;
    if (!node.left) return node.right;
    if (node.left.priority > node.right.priority) {
      const left = node.left;
      node.left = left.right;
      left.right = Treap.#deleteRoot(node);
      return left;
    }
    const right = node.right;
    node.right = right.left;
    right.left = Treap.#deleteRoot(node);
    return right;
  }

  static #delete<A>(node: Node<A>, index: number): Node<A> | undefined {
    if (index > node.index) {
      if (!node.right) return;
      node.right = Treap.#delete(node.right, index);
      return node;
    }
    if (index < node.index) {
      if (!node.left) return;
      node.left = Treap.#delete(node.left, index);
      return node;
    }
    return Treap.#deleteRoot(node);
  }

  delete(index: number) {
    if (!this.node) return;
    this.node = Treap.#delete(this.node, index);
  }
}
