// pick graph representation
export type FlowGraph<A> = {
  root: A;
  sources: A[];
  targets: A[];
};

// produce parent vector for depth first search
export function depthFirstSearch<A>(graph: FlowGraph<A>) {
  const parents = [0];
  const vertices: A[] = [];
  function search(source: A, parent: number) {
    vertices.push(source);
    for (let i = 0; i < graph.sources.length; i++) {
      const target = graph.targets[i];
      if (graph.sources[i] === source && !vertices.includes(target)) {
        search(target, parents.push(parent) - 1);
      }
    }
  }
  search(graph.root, 0);

  // more useful representation of the flow charts
  const predecessors: number[][] = vertices.map(() => []);
  graph.targets.forEach((t, i) =>
    predecessors[vertices.indexOf(t)].push(vertices.indexOf(graph.sources[i]))
  );
  return { parents, predecessors, vertices };
}

// better fit for the chosen representation
// but Lengauer-Tarjan does not work well with it.
export function dfs2<A>(graph: FlowGraph<A>) {
  const vertices: A[] = [graph.root];
  const parents: number[] = [0];
  let parent = 0;
  let todo = graph.sources.map((_, i) => i);
  while (todo.length) {
    const next = [];
    for (const i of todo) {
      const target = graph.targets[i];
      if (vertices.includes(target)) continue;
      if (graph.sources[i] === vertices[parent]) {
        parents.push(parent);
        parent = vertices.push(target) - 1;
        continue;
      }
      next.push(i);
    }
    if (todo.length === next.length) {
      if (parent === 0) break;
      parent--;
    }
    todo = next;
  }
  const predecessors: number[][] = vertices.map(() => []);
  graph.targets.forEach((t, i) => {
    const it = vertices.indexOf(t);
    if (it < 0) return;
    const is = vertices.indexOf(graph.sources[i]);
    if (is < 0) return;
    predecessors[it].push(is);
  });
  return { parents, predecessors, vertices };
}

/*
 * Lengauer-Tarjan for the dominance tree
 */
export class FindDominators {
  #semi: number[];
  idom: number[] = [];
  parents: number[];
  #bucket: number[][];

  // forest? yep! represented as parent vector
  #ancestor: number[];

  #label: number[];
  #size: number[];
  #child: number[]; // or 0!?

  // tree rebalance
  #update(w: number) {
    let s = w;
    let cs = this.#child[s];
    while (
      this.#child[cs] !== cs &&
      this.#semi[this.#label[w]] < this.#semi[this.#label[cs]]
    ) {
      const sccs = this.#size[this.#child[cs]];
      if (
        this.#size[s] + sccs >= 2 * this.#size[cs]
      ) {
        this.#ancestor[cs] = s;
        this.#child[s] = this.#child[cs];
      } else {
        this.#size[cs] = this.#size[s];
        s = this.#ancestor[s] = cs;
      }
      cs = this.#child[s];
    }
    this.#label[s] = this.#label[w];
    return s;
  }

  // merge trees
  #link(w: number) {
    this.#ancestor[w] = this.parents[w];
    const v = this.parents[w];
    let s = this.#update(w);
    if (this.#size[v] < 2 * this.#size[w]) {
      const t = s;
      s = this.#child[v];
      this.#child[v] = t;
    }
    this.#size[v] += this.#size[w];
    while (s !== this.#child[s]) {
      this.#ancestor[s] = v;
      s = this.#child[s];
    }
  }

  // find node with minimal semi on path to root in the forest.
  #eval(v: number) {
    this.#compress(v);
    const lv = this.#label[v];
    const lav = this.#label[this.#ancestor[v]];
    return this.#semi[lav] < this.#semi[lv] ? lav : lv;
  }

  #compress(v: number) {
    const u = this.#ancestor[v];
    if (u === v) return v;
    this.#compress(u);
    if (this.#semi[this.#label[v]] > this.#semi[this.#label[u]]) {
      this.#label[v] = this.#label[u];
    }
    this.#ancestor[v] = this.#ancestor[u];
  }

  constructor(
    { parents, predecessors }: {
      parents: number[];
      predecessors: number[][];
    },
  ) {
    this.parents = parents;
    this.#semi = Array(parents.length).keys().toArray();
    this.#bucket = this.#semi.map(() => []);
    this.#label = [...this.#semi];
    this.#ancestor = [...this.#semi];
    this.#child = [...this.#semi];
    this.#size = this.#semi.map(() => 1);

    for (let w = parents.length - 1; w > 0; w--) {
      // compute a minimal semi across predecessors
      for (const v of predecessors[w]) {
        const s = this.#semi[this.#eval(v)];
        if (this.#semi[w] > s) this.#semi[w] = s;
      }
      this.#bucket[this.#semi[w]].push(w);
      this.#link(w);

      const z = this.parents[w];
      for (const v of this.#bucket[z]) {
        const u = this.#eval(v);
        this.idom[v] = this.#semi[u] < this.#semi[v] ? u : z;
      }
      this.#bucket[z].length = 0;
    }

    this.idom[0] = 0;
    for (let w = 1; w < parents.length; w++) {
      if (this.idom[w] !== this.#semi[w]) {
        this.idom[w] = this.idom[this.idom[w]];
      }
    }
  }
}
