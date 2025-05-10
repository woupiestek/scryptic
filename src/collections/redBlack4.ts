import { NatSet } from "./natset.ts";

export class RedBlackTreeMap<A> {
  #red: NatSet = new NatSet();
  #keys: number[] = [];
  #values: A[] = [];
  #lefts: number[] = [];
  #rights: number[] = [];

  #isBalanced(tree: number) {
    return tree < 0 || !(this.#red.has(tree) &&
      (this.#red.has(this.#lefts[tree]) || this.#red.has(this.#rights[tree])));
  }

  #get(tree: number, key: number): A | undefined {
    for (;;) {
      if (tree < 0) return undefined;
      if (this.#keys[tree] === key) return this.#values[tree];
      tree = key < this.#keys[tree] ? this.#lefts[tree] : this.#rights[tree];
    }
  }

  #root = -1;

  get(key: number): A | undefined {
    return this.#get(this.#root, key);
  }

  *entries() {
    for (let i = 0, l = this.#keys.length; i < l; i++) {
      if (this.#values[i] !== undefined) {
        yield [this.#keys[i], this.#values[i]];
      }
    }
  }

  toString(): string {
    const y: string[] = [];
    for (const [k, v] of this.entries()) {
      y.push(`${k}: ${v}`);
    }
    return `{${y.join(", ")}}`;
  }

  #id = 0;

  #leaf(key: number, value: A) {
    const id = this.#free.pop() ?? this.#id++;
    this.#red.add(id);
    this.#lefts[id] = -1;
    this.#keys[id] = key;
    this.#values[id] = value;
    this.#rights[id] = -1;
    return id;
  }

  #withLeft(
    root: number,
    left: number,
  ) {
    if (left === this.#lefts[root]) return root;
    if (this.#isBalanced(left)) {
      this.#lefts[root] = left;
      return root;
    }
    if (this.#red.has(this.#rights[left])) {
      const rl = this.#rights[left];
      this.#rights[left] = this.#lefts[rl];
      this.#lefts[rl] = left;
      this.#lefts[root] = this.#rights[rl];
      this.#rights[rl] = root;
      this.#red.add(left);
      this.#red.add(root);
      this.#red.remove(rl);
      return rl;
    }
    this.#lefts[root] = this.#rights[left];
    this.#rights[left] = root;
    this.#red.add(root);
    this.#red.remove(left);
    return left;
  }

  #withRight(root: number, right: number) {
    if (right === this.#rights[root]) return root;
    if (this.#isBalanced(right)) {
      this.#rights[root] = right;
      return root;
    }
    if (this.#red.has(this.#lefts[right])) {
      const lr = this.#lefts[right];
      this.#lefts[right] = this.#rights[lr];
      this.#rights[lr] = root;
      this.#rights[root] = this.#lefts[lr];
      this.#lefts[lr] = right;
      this.#red.add(right);
      this.#red.add(root);
      this.#red.remove(lr);
      return lr;
    }
    this.#rights[root] = this.#lefts[right];
    this.#lefts[right] = root;
    this.#red.add(root);
    this.#red.remove(right);
    return right;
  }

  #set(root: number, key: number, value: A): number {
    if (root < 0) return this.#leaf(key, value);
    if (key === this.#keys[root]) {
      this.#values[root] = value;
      return root;
    }
    if (key < this.#keys[root]) {
      return this.#withLeft(root, this.#set(this.#lefts[root], key, value));
    }
    return this.#withRight(root, this.#set(this.#rights[root], key, value));
  }

  set(key: number, value: A) {
    this.#root = this.#set(this.#root, key, value);
    this.#red.remove(key);
  }

  #free: number[] = [];

  #dealloc(number: number) {
    delete this.#values[number];
    this.#free.push(number);
  }

  #removeLeast(root: number): [number, number, A] {
    const reverse: number[] = [];
    while (this.#lefts[root] >= 0) {
      reverse.push(root);
      root = this.#lefts[root];
    }
    const key = this.#keys[root];
    const value = this.#values[root];
    let result = this.#rights[root];
    this.#dealloc(root);
    while (reverse.length > 0) {
      result = this.#withLeft(reverse.pop() as number, result);
    }
    return [result, key, value];
  }

  #remove(root: number, key: number): number {
    if (key < this.#keys[root]) {
      if (this.#lefts[root] < 0) return root;
      return this.#withLeft(root, this.#remove(this.#lefts[root], key));
    }

    if (key > this.#keys[root]) {
      if (this.#rights[root] < 0) return root;
      return this.#withRight(root, this.#remove(this.#rights[root], key));
    }

    if (this.#lefts[root] < 0) {
      this.#dealloc(root);
      return this.#rights[root];
    }

    const [l, k, v] = this.#removeLeast(this.#lefts[root]);
    root = this.#withLeft(root, l);
    this.#keys[root] = k;
    this.#values[root] = v;
    return root;
  }

  remove(key: number) {
    this.#root = this.#remove(this.#root, key);
    this.#red.remove(this.#root);
  }
}
