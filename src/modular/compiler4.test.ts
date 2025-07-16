import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import {
  Expressions,
  prettyPrint,
  Statements,
  StaticSingleAssignment,
} from "./compiler4.ts";
import { Parse } from "../assembly/parse.ts";
import { Lex } from "../assembly/lex.ts";

Deno.test("pretty printer", () => {
  assertEquals(prettyPrint([2, 5, 2, 0, 5, 2, 0]), "(2 (0 3 6) (5 1 4))");
});

Deno.test("extracting expressions", () => {
  const exprs = new Expressions(
    new Parse(
      new Lex("a == b && c != d; !!a; (a = new b()).c; a(b, c); var a;"),
    ),
  );
  assertEquals(
    exprs.toString(),
    "(6 (2 0 1) (5 3 4));(9 (8 7));(16 (14 10 (13 (12 11))) 15);(20 17 18 19);(22 21)",
  );
});

Deno.test("extracting statements", () => {
  const stmts = new Statements(new Parse(new Lex("a;if b { c } else { d } e")));
  assertEquals(
    stmts.toString(),
    "(6 1 (3 2) (5 4));7",
  );
});

Deno.test("extracting loops", () => {
  const stmts = new Statements(new Parse(new Lex("while b { continue } d")));
  assertEquals(
    stmts.toString(),
    "(3 0 (2 1));4",
  );
});

Deno.test("extracting labelled loops", () => {
  const stmts = new Statements(
    new Parse(new Lex("#a while b { continue #a } d")),
  );
  assertEquals(
    stmts.toString(),
    "(5 0 1 (4 (3 2)));6",
  );
});

Deno.test("extracting labelled loops", () => {
  const stmts = new Statements(
    new Parse(new Lex("a; b; if c {d; e} else {f; g} h")),
  );
  assertEquals(
    stmts.toString(),
    "1;(9 2 (5 3 4) (8 6 7));10",
  );
});

Deno.test("identifiers", () => {
  console.log(new StaticSingleAssignment("var y = x; y"));
});
