import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton } from "./lexer.ts";
import { AttemptPlenty } from "./parser.ts";

// && = . != == < > >= <= || ( ,

const right = [
  "x && y == z",
  // "x == (y || z)",
  "x && y = z",
  "x && y != z",
  "x && y < z",
  "x = y(z)",
];
for (const text of right) {
  Deno.test(`precedence logic case '${text}'`, () => {
    const automaton = new Automaton();
    automaton.readString(text);
    const attemptPlenty = new AttemptPlenty();
    attemptPlenty.visitAll(automaton.types);
    assertEquals(
      attemptPlenty.debug(),
      "(0 1 (2 3 4))",
    );
  });
}
