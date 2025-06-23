import { LinkedList, LinkedLists } from "./linkedList.ts";
import { Table } from "./table.ts";

export class Trie<A> {
  static LL = new LinkedLists<number>();
  value?: A;
  children: Table<Trie<A>> = new Table();
  getChild(index: number): Trie<A> {
    const child = this.children.get(index);
    if (child) {
      return child;
    }
    const trie = new Trie<A>();
    this.children.set(index, trie);
    return trie;
  }
  getTrie(length: number, indices: (_: number) => number): Trie<A> {
    let trie = this.getChild(0);
    for (let i = 1; i < length; i++) {
      trie = trie.getChild(indices(i));
    }
    return trie;
  }

  *entries(
    prefix: LinkedList<number> = Trie.LL.EMPTY,
  ): Generator<[LinkedList<number>, A]> {
    if (this.value !== undefined) yield [prefix, this.value];
    for (const [k, v] of this.children.entries()) {
      yield* v.entries(Trie.LL.cons(k, prefix));
    }
  }

  *values(): Generator<A> {
    if (this.value !== undefined) yield this.value;
    for (const [_, v] of this.children.entries()) {
      yield* v.values();
    }
  }
}
