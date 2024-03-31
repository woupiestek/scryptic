type Node<A> = {
  index: number; // max index;
  value: A;
  even?: Node<A>;
  odd?: Node<A>;
};

const Node = {
  get<A>(node: Node<A>, index: number): A | undefined {
    if (index > node.index) return;
    if (index === node.index) return node.value;
    const j = index >>> 1;
    if (index & 1) {
      if (node.odd) {
        return this.get(node.odd, j);
      }
    } else if (node.even) {
      return this.get(node.even, j);
    }
    return;
  },
  setLess<A>(node: Node<A>, index: number, value: A): Node<A> {
    const j = index >>> 1;
    if (index & 1) {
      if (node.odd) {
        node.odd = this.set(node.odd, j, value);
      } else node.odd = { index: j, value };
    } else if (node.even) {
      node.even = this.set(node.even, j, value);
    } else node.even = { index: j, value };
    return node;
  },
  set<A>(node: Node<A>, index: number, value: A): Node<A> {
    if (index > node.index) {
      const i = node.index;
      const v = node.value;
      node.index = index;
      node.value = value;
      return this.setLess(node, i, v);
    }
    if (index === node.index) {
      node.value = value;
      return node;
    }
    return this.setLess(node, index, value);
  },
  deleteRoot<A>(node: Node<A>): Node<A> | undefined {
    if (node.even && (!node.odd || node.even.index > node.odd.index)) {
      node.index = node.even.index << 1;
      node.value = node.even.value;
      node.even = this.deleteRoot(node.even);
      return node;
    }
    if (node.odd) {
      node.index = (node.odd.index << 1) + 1;
      node.value = node.odd.value;
      node.odd = this.deleteRoot(node.odd);
      return node;
    }
    return;
  },
  delete<A>(node: Node<A>, index: number): Node<A> | undefined {
    if (index > node.index) return node;
    if (index === node.index) {
      return this.deleteRoot(node);
    }
    const j = index >>> 1;
    if (index & 1) {
      if (node.odd) {
        node.odd = this.delete(node.odd, j);
      }
    } else if (node.even) {
      node.even = this.delete(node.even, j);
    }
    return node;
  },
  merge<A>(a?: Node<A>, b?: Node<A>): Node<A> | undefined {
    if (!a) return b;
    if (!b) return a;
    a.even = this.merge(a.even, b.even);
    a.odd = this.merge(a.odd, b.odd);
    return this.set(a, b.index, b.value);
  },
  stream<A>(node?: Node<A>, factor = 1, offset = 0): _Stream<A> | undefined {
    if (!node) return;
    return append(
      (node.index * factor) + offset,
      node.value,
      merge(
        this.stream(node.even, factor * 2, offset),
        this.stream(node.odd, factor * 2, offset + factor),
      ),
    );
  },
};
type _Stream<A> = {
  index: number;
  value: A;
  tail: () => _Stream<A> | undefined;
};
function merge<A>(a?: _Stream<A>, b?: _Stream<A>): _Stream<A> | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.index < b.index) {
    const tail = a.tail;
    a.tail = () => merge(tail(), b);
    return a;
  }
  const tail = b.tail;
  b.tail = () => merge(a, tail());
  return b;
}
function append<A>(index: number, value: A, stream?: _Stream<A>): _Stream<A> {
  if (!stream) {
    return { index, value, tail: () => undefined };
  }
  const tail = stream.tail;
  stream.tail = () => append(index, value, tail());
  return stream;
}

export class NumberTrie<A> {
  private node?: Node<A>;
  get(index: number): A | undefined {
    if (!this.node) return;
    return Node.get(this.node, index);
  }
  set(index: number, value: A): void {
    if (!this.node) {
      this.node = { index, value };
    } else {
      this.node = Node.set(this.node, index, value);
    }
  }
  delete(index: number): void {
    if (!this.node) return;
    this.node = Node.delete(this.node, index);
  }
  *entries(): Generator<[number, A]> {
    let stream = Node.stream(this.node);
    while (stream) {
      yield [stream.index, stream.value];
      stream = stream.tail();
    }
  }
  toString(): string {
    return "{" +
      [...this.entries()].map(([k, v]) => k + ": " + v?.toString()).join(", ") +
      "}";
  }
}
