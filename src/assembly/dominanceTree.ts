// pick graph representation
type FlowGraph<A> = {
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
export function search<A>(graph: FlowGraph<A>) {
  const vertices: A[] = [graph.root];
  const parents: number[] = [0];
  let todo = graph.sources.map((_, i) => i);
  while (todo.length) {
    const next = [];
    for (const i of todo) {
      const target = graph.targets[i];
      if (vertices.includes(target)) continue;
      const parent = vertices.indexOf(graph.sources[i]);
      if (parent >= 0) {
        parents.push(parent);
        vertices.push(target);
      } else next.push(i);
    }
    todo = next;
  }
  const predecessors: number[][] = vertices.map(() => []);
  graph.targets.forEach((t, i) =>
    predecessors[vertices.indexOf(t)].push(vertices.indexOf(graph.sources[i]))
  );
  return { parents, predecessors, vertices };
}

/*
 * Lengauer-Tarjan for the dominance tree
 *
 * I cannot wrap my head around this yet.
 */
export class FindDominators {
  #semi: number[];
  idom: number[] = [];
  parents: number[] = [];
  #bucket: number[][];
  // forest?
  #ancestor: number[] = [];
  #label: number[];
  #size: number[];
  #child: number[] = []; // or 0!?

  #update(w: number) {
    let s = w;
    let t = this.#child[s];
    while (
      this.#semi[this.#label[w]] < this.#semi[this.#label[t]]
    ) {
      if (
        this.#size[s] + this.#size[this.#child[t]] >=
          2 * this.#size[t]
      ) {
        this.#ancestor[this.#child[s]] = s;
        this.#child[s] = this.#child[t];
      } else {
        this.#size[t] = this.#size[s];
        s = this.#ancestor[s] = t;
      }
      t = this.#child[s];
    }
    this.#label[s] = this.#label[w];
    return s;
  }

  #link(w: number) {
    const v = this.parents[w];
    let s = this.#update(w);
    this.#size[v] += this.#size[w];
    if (this.#size[v] < 2 * this.#size[w]) {
      const t = s;
      s = this.#child[v];
      this.#child[v] = t;
    }
    while (s > 0) {
      this.#ancestor[s] = v;
      s = this.#child[s];
    }
  }

  #eval(v: number) {
    if (this.#ancestor[v] === undefined) return this.#label[v];
    this.#compress(v);
    const z = this.#ancestor[v];
    return this.#semi[this.#label[z]] < this.#semi[this.#label[v]]
      ? this.#label[z]
      : this.#label[v];
  }

  #compress(v: number) {
    const u = this.#ancestor[v];
    if (u === undefined) return;
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
    this.#size = this.#semi.map(() => 1);

    for (let w = parents.length - 1; w > 0; w--) {
      for (const v of this.#bucket[w]) {
        const u = this.#eval(v);
        this.idom[v] = this.#semi[u] < this.#semi[v] ? u : w;
      }
      for (const v of predecessors[w]) {
        const x = this.#eval(v);
        if (this.#semi[w] > this.#semi[x]) this.#semi[w] = this.#semi[x];
      }
      this.#bucket[this.#semi[w]].push(w);
      this.#link(w);
    }
    for (const v of this.#bucket[0]) {
      const u = this.#eval(v);
      this.idom[v] = this.#semi[u] < this.#semi[v] ? u : 0;
    }

    for (let w = 1; w < parents.length; w++) {
      if (this.idom[w] !== this.#semi[w]) {
        this.idom[w] = this.idom[this.idom[w]];
      }
    }
    this.idom[0] = 0;
  }
}
