import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton } from "./lexer.ts";
import { PrattParser } from "./pratt.ts";

// && = . != == < > >= <= || ( ,

const bindRight = [
  "x && y == true",
  "x || y = z",
  'x = y && "hello"',
  "x && y != z",
  "x || this < z",
  "x = y(z)",
  '"test" == x.y',
];
for (const text of bindRight) {
  Deno.test(`bind right case '${text}'`, () => {
    const automaton = new Automaton();
    automaton.readString(text);
    const attemptPlenty = new PrattParser();
    attemptPlenty.visitAll(automaton.types);
    assertEquals(
      attemptPlenty.debug(),
      "(0) 1 ((2) 3 (4))",
    );
  });
}

const bindLeft = [
  "x == y && z",
  "x != y || z",
  "false < y && z",
  "x && y || z",
  'x.y="text"',
];

for (const text of bindLeft) {
  Deno.test(`bind left case '${text}'`, () => {
    const automaton = new Automaton();
    automaton.readString(text);
    const attemptPlenty = new PrattParser();
    attemptPlenty.visitAll(automaton.types);
    assertEquals(
      attemptPlenty.debug(),
      "((0) 1 (2)) 3 (4)",
    );
  });
}

const bindRightForParens = [
  "x == (y && z)",
  "x != (y || z)",
  "x < (y && z)",
  "x && (y || z)",
];
for (const text of bindRightForParens) {
  Deno.test(`bind right case '${text}'`, () => {
    const automaton = new Automaton();
    automaton.readString(text);
    const attemptPlenty = new PrattParser();
    attemptPlenty.visitAll(automaton.types);
    assertEquals(
      attemptPlenty.debug(),
      "(0) 1 ((3) 4 (5))",
    );
  });
}

const bindLeftForParens = [
  "(x && y) == z",
  "(x || y) = z",
  "(x = y) && z",
  "(x && y) != z",
  "(x || y) < z",
  '(x = y)("ok")',
];

for (const text of bindLeftForParens) {
  Deno.test(`bind left case '${text}'`, () => {
    const automaton = new Automaton();
    automaton.readString(text);
    const attemptPlenty = new PrattParser();
    attemptPlenty.visitAll(automaton.types);
    assertEquals(
      attemptPlenty.debug(),
      "((1) 2 (3)) 5 (6)",
    );
  });
}

Deno.test("parameter list", () => {
  const automaton = new Automaton();
  automaton.readString("z = f(x, y)");
  const attemptPlenty = new PrattParser();
  attemptPlenty.visitAll(automaton.types);
  assertEquals(
    attemptPlenty.debug(),
    "(0) 1 (((2) 3 (4)) 5 (6))",
  );
});

Deno.test("empty parameter list", () => {
  const automaton = new Automaton();
  automaton.readString("z = f()");
  const attemptPlenty = new PrattParser();
  attemptPlenty.visitAll(automaton.types);
  assertEquals(
    attemptPlenty.debug(),
    "(0) 1 ((2) 3)",
  );
});

const unary = [
  "y = new x",
  '"a" < log "hello"',
  "false == !true",
];

for (const unaryCase of unary) {
  Deno.test(`unary operator case '${unaryCase}'`, () => {
    const automaton = new Automaton();
    automaton.readString(unaryCase);
    const attemptPlenty = new PrattParser();
    attemptPlenty.visitAll(automaton.types);
    assertEquals(
      attemptPlenty.debug(),
      "(0) 1 (2 (3))",
    );
  });
}

const identifierRequired = [
  'x."wrong!"',
  'var "oops!"',
  'new "forget it!"',
];

for (const ir of identifierRequired) {
  Deno.test(`identifier required case '${ir}'`, () => {
    const automaton = new Automaton();
    automaton.readString(ir);
    const attemptPlenty = new PrattParser();
    const e = assertThrows(
      () => attemptPlenty.visitAll(automaton.types),
    ) as Error;
    assertEquals(e.message, "identifier required");
  });
}

Deno.test("missing ')'", () => {
  const automaton = new Automaton();
  automaton.readString("(x = y != (f(z && (a");
  const attemptPlenty = new PrattParser();
  const e = assertThrows(
    () => attemptPlenty.visitAll(automaton.types),
  ) as Error;
  assertEquals(e.message, "missing '))))'");
});

Deno.test("missing '('", () => {
  const automaton = new Automaton();
  automaton.readString("x = y != f(z)) && a))");
  const attemptPlenty = new PrattParser();
  const e = assertThrows(
    () => attemptPlenty.visitAll(automaton.types),
  ) as Error;
  assertEquals(e.message, "missing '('");
});

Deno.test("unexpected comma", () => {
  const automaton = new Automaton();
  automaton.readString("(x, y, z)");
  const attemptPlenty = new PrattParser();
  const e = assertThrows(
    () => attemptPlenty.visitAll(automaton.types),
  ) as Error;
  assertEquals(e.message, "unexpected ','");
});

Deno.test("unexpected token", () => {
  const automaton = new Automaton();
  automaton.readString("x: y");
  const attemptPlenty = new PrattParser();
  const e = assertThrows(
    () => attemptPlenty.visitAll(automaton.types),
  ) as Error;
  assertEquals(e.message, "unexpected token COLON");
});

Deno.test("expression expected", () => {
  const automaton = new Automaton();
  automaton.readString("x && )");
  const attemptPlenty = new PrattParser();
  const e = assertThrows(
    () => attemptPlenty.visitAll(automaton.types),
  ) as Error;
  assertEquals(e.message, "misplaced ')'");
});

Deno.test("expression expected ", () => {
  const automaton = new Automaton();
  automaton.readString("x && ||");
  const attemptPlenty = new PrattParser();
  const e = assertThrows(
    () => attemptPlenty.visitAll(automaton.types),
  ) as Error;
  assertEquals(e.message, "misplaced OR: expression required");
});
