import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { rep } from "./reducer3.ts";
import { Lexer } from "./lexer.ts";
import { Parser, stringifyTerm } from "./parser3.ts";

const test = "x, x = $y";
Deno.test(function lexer() {
  const lexer = new Lexer(test);
  assertEquals(lexer.types.length, 6);
});

Deno.test(function parser() {
  assertEquals(stringifyTerm(new Parser(test).term()), test);
});

Deno.test(function tryRep() {
  assertEquals(rep(test), "$y()");
});

Deno.test(function trySomeMore() {
  assertEquals(
    [
      "$x",
      "\\@$x",
      "@\\x",
      "@\\$z",
      "@$\\w",
      "a, a = $b",
      "$a, a = $b",
      "@if, if = \\then, then = a, else = b",
    ].map(
      rep,
    ),
    ["$x()", "\\@$x()", "x()", "z()", "w()", "$b()", "$a()", "a()"],
  );
});
