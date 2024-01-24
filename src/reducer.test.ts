import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { rep } from "./reducer.ts";
import { Lexer, Token, TokenType } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { Term } from "./model.ts";

const test = "{x = $y, \\x}.";
Deno.test(function lexer() {
  const lexer = new Lexer(test);
  const tokens: Token[] = [];
  for (;;) {
    const token = lexer.next();
    if (token.type === TokenType.END) break;
    tokens.push(token);
  }
  assertEquals(tokens.length, 10);
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
      "\\$x.",
      "{\\$x}.",
      "{a = $b, \\a}.",
      "{a = $b, \\$a}.",
      "{c=\\t,\\{t=a,f=b,c}.}.",
    ].map(
      rep,
    ),
    ["$x()", "\\$x.", "x()", "$b()", "a()", "a()"],
  );
});
