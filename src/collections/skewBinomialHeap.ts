class ListNode<A> {
  constructor(
    readonly head: A,
    readonly tail?: ListNode<A>,
  ) {}
}

export class Node<A> {
  constructor(
    readonly rank: number,
    readonly root: A,
    readonly left?: ListNode<A>,
    readonly right?: HeapNode<A>,
  ) {}
  link(that: Node<A>) {
    if (this.root <= that.root) {
      return new Node(
        this.rank + 1,
        this.root,
        this.left,
        new HeapNode(that, this.right),
      );
    }
    return new Node(
      this.rank + 1,
      that.root,
      that.left,
      new HeapNode(this, this.right),
    );
  }
  skewLink(value: A, that: Node<A>) {
    const linked = this.link(that);
    if (value <= linked.root) {
      return new Node(
        linked.rank,
        value,
        new ListNode(linked.root, linked.left),
        linked.right,
      );
    }
    return new Node(
      linked.rank,
      linked.root,
      new ListNode(value, linked.left),
      linked.right,
    );
  }
}

export class HeapNode<A> {
  constructor(
    readonly head: Node<A>,
    readonly tail?: HeapNode<A>,
  ) {}
  static singleton<A>(node: Node<A>) {
    return new HeapNode(node);
  }

  insertNode(node: Node<A>) {
    if (node.rank < this.head.rank) {
      return new HeapNode(node, this);
    }
    return new HeapNode(node.link(this.head), this.tail);
  }

  #merge(that: HeapNode<A>): HeapNode<A> {
    if (this.head.rank < that.head.rank) {
      return new HeapNode(this.head, this.tail ? this.tail.#merge(that) : that);
    }
    if (that.head.rank < this.head.rank) {
      return new HeapNode(that.head, that.tail ? that.tail.#merge(this) : this);
    }
    return new HeapNode(
      this.head.link(that.head),
      this.tail ? that.tail ? this.#merge(that.tail) : this.tail : that.tail,
    );
  }

  #normalize() {
    return this.tail ? this.tail.insertNode(this.head) : this;
  }

  merge(that: HeapNode<A>) {
    return this.#normalize().#merge(that.#normalize());
  }

  insert(value: A) {
    if (this.tail && this.head.rank === this.tail.head.rank) {
      return new HeapNode(
        this.head.skewLink(value, this.tail.head),
        this.tail.tail,
      );
    }
    return new HeapNode(new Node(0, value), this);
  }

  #removeLeastNode(): [Node<A>, HeapNode<A>?] {
    if (!this.tail) return [this.head];
    const [h, t] = this.tail.#removeLeastNode();
    if (this.head.root <= h.root) {
      return [this.head, this.tail];
    }
    return [h, new HeapNode(this.head, t)];
  }

  findLeast() {
    return this.#removeLeastNode()[0].root;
  }

  #reverse() {
    let result = new HeapNode(this.head);
    let tail = this.tail;
    while (tail) {
      result = new HeapNode(tail.head, result);
      tail = tail.tail;
    }
    return result;
  }
  deleteLeast() {
    const [h, t] = this.#removeLeastNode();
    let heap = h.right
      ? t ? h.right.#reverse().merge(t) : h.right.#reverse()
      : t;
    let values = h.left;
    while (values) {
      heap = heap?.insert(values.head);
      values = values.tail;
    }
    return heap;
  }
}
