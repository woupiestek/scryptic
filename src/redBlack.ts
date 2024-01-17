type Node<A> = {
  key: string;
  value: A;
  red: boolean;
  left?: Node<A>;
  right?: Node<A>;
};

function get<A>(key: string, node?: Node<A>): A | undefined {
  for (;;) {
    if (!node) return undefined;
    if (key === node.key) return node.value;
    if (key < node.key) {
      node = node.left;
    } else {
      node = node.right;
    }
  }
}

type X<A> = [true, Node<A>] | [
  false,
  Node<A> | undefined,
  string,
  A,
  Node<A> | undefined,
  string,
  A,
  Node<A> | undefined,
];

// does not produce a proper tree
function _add<A>(key: string, value: A, node?: Node<A>): X<A> {
  if (!node) return [true, { key, value, red: true }];
  if (key === node.key) return [true, { ...node, value }];
  if (key < node.key) {
    const x = _add(key, value, node.left);
    if (x[0]) {
      if (node.red && x[1].red) {
        return [
          false,
          x[1].left,
          x[1].key,
          x[1].value,
          x[1].right,
          node.key,
          node.value,
          node.right,
        ];
      } else {
        return [true, { ...node, left: x[1] }];
      }
    }
    // unbalanced
    return [true, {
      red: true,
      left: {
        red: false,
        left: x[1],
        key: x[2],
        value: x[3],
        right: x[4],
      },
      key: x[5],
      value: x[6],
      right: {
        ...node,
        red: false,
        left: x[7],
      },
    }];
  }
  // if (key > node.key)
  const x = _add(key, value, node.right);
  if (x[0]) {
    if (node.red && x[1].red) {
      return [
        false,
        node.left,
        node.key,
        node.value,
        x[1].left,
        x[1].key,
        x[1].value,
        x[1].right,
      ];
    } else {
      return [true, { ...node, right: x[1] }];
    }
  }
  // unbalanced
  return [true, {
    red: true,
    left: {
      ...node,
      red: false,
      right: x[1],
    },
    key: x[2],
    value: x[3],
    right: {
      red: false,
      left: x[4],
      key: x[5],
      value: x[6],
      right: x[7],
    },
  }];
}

function add<A>(key: string, value: A, node?: Node<A>): Node<A> {
  const x = _add(key, value, node);
  if (x[0]) {
    x[1].red = false;
    return x[1];
  }
  return {
    red: false,
    left: x[1],
    key: x[2],
    value: x[3],
    right: {
      red: true,
      left: x[4],
      key: x[5],
      value: x[6],
      right: x[7],
    },
  };
}

function* entries<A>(node?: Node<A>): Generator<[string, A]> {
  const rights = [];
  for (;;) {
    if (node) {
      rights.push(node);
      node = node.left;
      continue;
    }
    node = rights.pop();
    if (!node) return;
    yield [node.key, node.value];
    node = node.right;
  }
}

export class RedBlackTreeMap<A> {
  private node?: Node<A>;
  constructor(map?: RedBlackTreeMap<A>) {
    this.node = map?.node;
  }
  get(key: string): A | undefined {
    return get(key, this.node);
  }
  set(key: string, value: A): void {
    this.node = add(key, value, this.node);
  }
  *entries(): Generator<[string, A]> {
    for (const e of entries(this.node)) {
      yield e;
    }
  }
  object(): { [_: string]: A } {
    const y: { [_: string]: A } = {};
    for (const [k, v] of entries(this.node)) {
      y[k] = v;
    }
    return y;
  }
  toString(): string {
    const y: string[] = [];
    for (const [k, v] of entries(this.node)) {
      y.push(`${k}: ${v}`);
    }
    return `{${y.join(", ")}}`;
  }
  copy(): RedBlackTreeMap<A> {
    return new RedBlackTreeMap(this);
  }
}
