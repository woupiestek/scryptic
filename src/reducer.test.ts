import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { rep } from "./reducer.ts";
import { Lexer } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { Term } from "./model.ts";

const test = "x = $y, \\x.";
Deno.test(function lexer() {
  const lexer = new Lexer(test);
  assertEquals(lexer.types.length, 8);
});

Deno.test(function parser() {
  assertEquals(Term.stringify(new Parser(test).term()), test);
});

Deno.test(function tryRep() {
  assertEquals(rep(test), "$y()");
});

Deno.test(function trySomeMore() {
  assertEquals(
    [
      "$x",
      "\\{$x.}",
      "\\$x.",
      "a = $b, \\a.",
      "a = $b, \\$a.",
      "{if = \\then, \\{then = a, else = b, if.}.}",
    ].map(
      rep,
    ),
    ["$x()", "\\{$x.}()", "x()", "$b()", "a()", "a()"],
  );
});
