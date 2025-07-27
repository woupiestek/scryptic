import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { depthFirstSearch, FindDominators, search } from "./dominanceTree.ts";

Deno.test("depth first search implemented correctly", () => {
  assertEquals(
    depthFirstSearch({
      root: 1,
      sources: [1, 1, 2, 2, 3],
      targets: [2, 3, 4, 5, 6],
    }),
    {
      parents: [0, 0, 1, 1, 0, 4],
      predecessors: [[], [0], [1], [1], [0], [4]],
      vertices: [1, 2, 4, 5, 3, 6],
    },
  );

  assertEquals(
    depthFirstSearch({
      root: 2,
      sources: [2, 2, 0, 0, 5, 5],
      targets: [0, 5, 3, 6, 1, 4],
    }),
    {
      parents: [0, 0, 1, 1, 0, 4, 4],
      predecessors: [[], [0], [1], [1], [0], [4], [4]],
      vertices: [2, 0, 3, 6, 5, 1, 4],
    },
  );
});

Deno.test("search", () => {
  assertEquals(
    search({
      root: 1,
      sources: [1, 1, 2, 2, 3],
      targets: [2, 3, 4, 5, 6],
    }),
    {
      parents: [0, 0, 0, 1, 1, 2],
      predecessors: [[], [0], [0], [1], [1], [2]],
      vertices: [1, 2,3, 4, 5, 6],
    },
  );

  assertEquals(
    search({
      root: 2,
      sources: [2, 2, 0, 0, 5, 5],
      targets: [0, 5, 3, 6, 1, 4],
    }),
    {
      parents: [0, 0, 0, 1, 1, 2, 2],
      predecessors: [[], [0], [0], [1], [1], [2], [2]],
      vertices: [2, 0, 5, 3, 6, 1, 4],
    },
  );
});

Deno.test("dominance trees", () => {
  assertEquals(
    new FindDominators({
      parents: [0, 0, 1, 2, 3, 1],
      predecessors: [[], [0], [1], [2, 5], [3], [1]],
    }).idom,
    [0, 0, 1, 1, 3, 1],
  );

  assertEquals(
    new FindDominators({
      parents: [0, 0, 1, 1],
      predecessors: [[], [0, 2], [1], [1]],
    }).idom,
    [0, 0, 1, 1],
  );
});
