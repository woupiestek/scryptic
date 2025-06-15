import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import {
  Expressions,
  Statements,
  StaticSingleAssignment,
} from "./compiler4.ts";
import { Automaton } from "./lexer.ts";
import { Parser } from "./yap.ts";

Deno.test("extracting expressions", () => {
  const automaton = new Automaton();
  const parser = new Parser();
  automaton.readString(
    "a == b && c != d; !!a; (a = new b()).c; a(b, c); var a;",
  );
  parser.visitAll(automaton.types);
  const exprs = new Expressions(parser.frames);
  assertEquals(
    exprs.toString(),
    "(3 (1 0 2) (5 4 6));(8 (9 10));(20 (14 13 (17 (15 16))) 21);(24 23 (26 25 27));(30 31)",
  );
});

Deno.test("extracting statements", () => {
  const automaton = new Automaton();
  const parser = new Parser();
  automaton.readString("a;if b { c } else { d } e");
  parser.visitAll(automaton.types);
  const stmts = new Statements(parser.frames);
  assertEquals(
    stmts.toString(),
    "(0 (2 (4 5 6) (7 (8 9 10)) 11))",
  );
});

Deno.test("extracting loops", () => {
  const automaton = new Automaton();
  const parser = new Parser();
  automaton.readString("while b { continue } d");
  parser.visitAll(automaton.types);
  const stmts = new Statements(parser.frames);
  assertEquals(
    stmts.toString(),
    "(0 (2 (3 4)) 5)",
  );
});

Deno.test("extracting labelled loops", () => {
  const automaton = new Automaton();
  const parser = new Parser();
  automaton.readString("#a while b { continue #a } d");
  parser.visitAll(automaton.types);
  const stmts = new Statements(parser.frames);
  assertEquals(
    stmts.toString(),
    "(0 (3 (4 5)) 7)",
  );
});

Deno.test("extracting labelled loops", () => {
  const automaton = new Automaton();
  const parser = new Parser();
  automaton.readString("a; b; if c {d; e} else {f; g} h");
  parser.visitAll(automaton.types);
  const stmts = new Statements(parser.frames);
  assertEquals(
    stmts.toString(),
    "(0 (2 (4 (6 (7 9) 10) (11 (12 (13 15) 16)) 17)))",
  );
});

Deno.test("identifiers", () => {
  console.log(new StaticSingleAssignment("var y = x; y"));
});
