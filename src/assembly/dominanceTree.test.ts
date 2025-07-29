import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { depthFirstSearch, dfs2, FindDominators } from "./dominanceTree.ts";
import { KeepGoing } from "./keepGoing.ts";
import { Lex } from "./lex.ts";
import { Parse } from "./parse.ts";

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
    dfs2({
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
    dfs2({
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

  assertEquals(
    new FindDominators({
      parents: [0, 0, 1, 0],
      predecessors: [[], [0], [1, 3], [0]],
    }).idom,
    [0, 0, 0, 0],
  );
});

const goodCases = [
  'var x;\
        { x = "Hello, World!" }\
        log x',
  'var x = "Something else";\
        { x = "Hello, World!" }\
        log x',
  '{ var x = "Hello, World!" } log x',
  'var x; { var x = "Hello, World!" } log x',
  'var x = "wrong!"; if true { x = "right!" } log x',
  'var x = "wrong!"; if false { x = "wrong!" } else { x = "right!" } log x',
  'var x = "wrong!"; if !true { x = "wrong!" } else { x = "right!" } log x',
  'var x = "wrong!"; if x == "wrong!" { x = "right!" } log x',
  'var x = "test"; if x != "test" { x = "wrong!" } else { x = "right!" } log x',
  'var x = "test"; if x < "zzz" { x = "right!" } else { x = "wrong!" } log x',
  'var x = "test"; if x <= "zzz" { x = "right!" } else { x = "wrong!" } log x',
  'var x = "test"; if x > "zzz" { x = "wrong!" } else { x = "right!" } log x',
  'var x = "test"; if x >= "zzz" { x = "wrong!" } else { x = "right!" } log x',
  'var x = "test"; if !(x < "zzz") { x = "wrong!" } else { x = "right!" } log x',
  // flow graph correct, dominance graph failed
  'var x = "test"; if x < "zzz" && true { x = "right!" } else { x = "wrong!" } log x',
  // flow graph correct, dominance graph failed
  'var x = "test"; if x > "zzz" || true { x = "right!" } else { x = "wrong!" } log x',
  // flow graph correct, dominance graph failed
  'var x = "test"; if !(x > "zzz" || true) { x = "wrong!" } else { x = "right!" } log x',
  'var x; if true { x = "wrong!" } log x',
  // something goes wrong with the flow graph
  'var x; var y = new A(); x = y.m = "test"; if x == "test" { log "right!" } else { log "wrong!" }',
  'var x = "wrong!"; #a while true \{ if x != "right!" \{ x = "right!"; continue #a \} break #a \} log x',
  'var x = "wrong!"; while true { x = "right!"; break } log x',
  'var x = "wrong!"; while !false { if x == "right!" { break } else { x = "right!"; continue } } log x',
  'var x = "wrong!"; while x != "right!" { x = "right!" } log x',
];

for (const goodCase of goodCases) {
  Deno.test(`no failure in good case ${goodCase}`, () => {
    const lex = new Lex(goodCase);
    const parse = new Parse(lex);
    const flowGraph = new KeepGoing(parse).flowGraph;
    console.log("flow graph", flowGraph);
    const sg = dfs2(flowGraph);
    console.log("search graph", sg);
    const dt = new FindDominators(sg);
    console.log("dominator tree", dt);
  });
}
