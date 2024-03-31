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
    if (index & 1) {
      if (node.odd) {
        return this.get(node.odd, index >>> 1);
      }
      return;
    }
    if (node.even) {
      return this.get(node.even, index >>> 1);
    }
    return;
  },
  set<A>(node: Node<A>, index: number, value: A): Node<A> {
    if (index > node.index) {
      const i = node.index;
      const v = node.value;
      node.index = index;
      node.value = value;
      Node.set(node, i, v);
    }
    if (index === node.index) {
      node.value = value;
    } else if (index & 1) {
      if (node.odd) {
        node.odd = this.set(node.odd, index >>> 1, value);
      } else {
        node.odd = { index: index >>> 1, value };
      }
    } else if (node.even) {
      node.even = this.set(node.even, index >>> 1, value);
    } else node.even = { index: index >>> 1, value };
    return node;
  },
  deleteRoot<A>(node: Node<A>): Node<A> | undefined {
    if (node.even && (!node.odd || node.even.index > node.odd.index)) {
      node.index = node.even.index << 1;
      node.value = node.even.value; // can this be avoided?
      node.even = Node.deleteRoot(node.even);
      return node;
    }
    if (node.odd) {
      node.index = (node.odd.index << 1) + 1;
      node.value = node.odd.value; // can this be avoided?
      node.odd = Node.deleteRoot(node.odd);
      return node;
    }
    return;
  },
  delete<A>(node: Node<A>, index: number): Node<A> | undefined {
    if (index > node.index) return node;
    if (index == node.index) {
      return this.deleteRoot(node);
    }
    if (index & 1) {
      if (node.odd) {
        node.odd = this.delete(node.odd, index >>> 1);
      }
    } else if (node.even) {
      node.even = this.delete(node.even, index >>> 1);
    }
    return node;
  },
  // it is a helper function, so could it not have a more helpful return type?
  // tail = () => {index:number, value:A, tail:tail}?
  *entries<A>(
    node: Node<A>,
    shift = 0,
    offset = 0,
  ): Generator<[number, A]> {
    if (node.even) {
      if (node.odd) {
        const even = Node.entries(node.even, shift + 1, offset << 2);
        const odd = Node.entries(node.odd, shift + 1, (offset << 1) + 1);
        let e = even.next();
        let o = odd.next();
        for (;;) {
          if (e.value[0] < o.value[0]) {
            yield e.value;
            if (e.done) {
              yield o.value;
              yield* odd;
              yield [(node.index << shift) + offset, node.value];
              return;
            }
            e = even.next();
            continue;
          }
          yield o.value;
          if (o.done) {
            yield e.value;
            yield* even;
            return;
          }
          o = odd.next();
        }
      }
      yield* Node.entries(node.even, shift + 1, offset << 1);
    } else if (node.odd) {
      yield* Node.entries(node.odd, shift + 1, (offset << 1) + 1);
    }
    yield [(node.index << shift) + offset, node.value];
  },
};
