import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Term } from "./terms.ts";
import { reduce } from "./reduce.ts";

Deno.test("stringify some", () => {
  const term = Term.get("x").alpha().set("y", Term.get("z").kappa().lambda());
  assertEquals(term.nodes, ["x", "α", "y", "z", "κ", "λ", "="]);
  assertEquals(term.toString(), "[x·α y z·κ·λ]");
});

Deno.test("reduce", () => {
  assertEquals(reduce(Term.get("x").lambda().set("x", Term.get("y")).alpha()), [
    [],
    "y",
  ]);
  assertEquals(reduce(Term.get("x").kappa().set("x", Term.get("y")).alpha()), [
    [],
    "x",
  ]);
  assertEquals(reduce(Term.get("x").lambda().set("y", Term.get("z")).alpha()), [
    [],
    "x",
  ]);
  assertEquals(
    reduce(
      Term.get("if").lambda()
        .set("if", Term.get("then").lambda())
        .alpha()
        .set("then", Term.get("A"))
        .set("else", Term.get("B")).alpha(),
    ),
    [[], "A"],
  );
});
