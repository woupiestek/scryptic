import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Expressions, Statements } from "./compiler4.ts";
import { Automaton } from "./lexer.ts";
import { Parser } from "./yap.ts";

Deno.test("extracting expressions", () => {
  const automaton = new Automaton();
  const parser = new Parser();
  automaton.readString("a == b && c != d; !!a; (a = new b()).c; a(b, c)");
  parser.visitAll(automaton.types);
  console.log(parser.frames.toString());
  const exprs = new Expressions(parser.frames);
  assertEquals(
    exprs.toString(),
    "(3 (1 0 2) (5 4 6))\n(8 (9 10))\n(20 (14 13 (17 (15 16))) 21)\n(24 23 (26 25 27))",
  );
});

Deno.test("extracting statements", () => {
  const automaton = new Automaton();
  const parser = new Parser();
  automaton.readString("a;b");
  parser.visitAll(automaton.types);
  console.log(parser.frames.toString());
  const stmts = new Statements(parser.frames);
  assertEquals(
    stmts.toString(),
    "",
  );
});
