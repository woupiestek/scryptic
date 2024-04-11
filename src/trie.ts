import { Table } from "./table.ts";

export class Trie<A> {
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
}
