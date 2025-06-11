import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton } from "./lexer.ts";
import { Parser } from "./yap.ts";
import { Trees } from "./prattify.ts";

const goodCases = [
  'log "Hello, World!"',
  'log "Hello, \u2260!"',
  'var x = "Hello, World!"; log x',
  'x = "Hello, World!"; log x',
  'var x;\
        { x = "Hello, World!" }\
        log x',
  'var x = "Something else";\
        { x = "Hello, World!" }\
        log x',
  '{ var x = "Hello, World!" } log x',
  'var x; { var x = "Hello, World!" } log x',
  "var x = new A(); log x",
  'var x; log (x = "Hello, World!")',
  'var x = new A(); x.y = "Hello, World!"; log(x.y)',
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
  'var x = "test"; if x < "zzz" && true { x = "right!" } else { x = "wrong!" } log x',
  'var x = "test"; if x > "zzz" || true { x = "right!" } else { x = "wrong!" } log x',
  'var x = "test"; if !(x > "zzz" || true) { x = "wrong!" } else { x = "right!" } log x',
  'var x; if true { x = "wrong!" } log x',
  'var x; var y = new A(); x = y.m = "test"; if x == "test" { log "right!" } else { log "wrong!" }',
  '(var x = new A()).y = "right!"; log(x.y)',
  // 'class A { (){ log "right!" } } new A().()',
  // 'class A { new(){ log "right!" } } new A()',
  // 'class A { (){ return "right!" } } log(new A().())',
  // 'class A { print(x){ log x } } new A().print("right!")',
  // 'class A { new(x){ log x } } new A("right!")',
  // 'class A { new(x){ this.x = x } } log(new A("right!").x)',
  'var x = "wrong!"; #a while true \{ if x != "right!" \{ x = "right!"; continue #a \} break #a \} log x',
  'var x = "wrong!"; while true { x = "right!"; break } log x',
  'var x = "wrong!"; while !false { if x == "right!" { break } else { x = "right!"; continue } } log x',
  'var x = "wrong!"; while x != "right!" { x = "right!" } log x',
  "x && y == z;",
  "z = f(x, y);",
  "",
];

for (const testCode of goodCases) {
  Deno.test(`No blow up on '${testCode}'`, () => {
    const automaton = new Automaton();
    automaton.readString(testCode);
    const parser = new Parser();
    parser.visitAll(automaton.types);
  });
}

const badCases = [
  ";",
  "log",
  'var "Hello, World!"; log x',
  "var x = ; log x",
  'var x;\
  { x = "Hello, World!" };\
  log x',
  '&&"help"',
  "true &&",
  "true if",
];

for (const testCode of badCases) {
  Deno.test(`Blow up on '${testCode}'`, () => {
    const automaton = new Automaton();
    automaton.readString(testCode);
    const parser = new Parser();
    assertThrows(() => parser.visitAll(automaton.types));
  });
}

const bindRight = [
  "x && y == z",
  "x = y && z",
  "x && y != z",
  "x || y < z",
  "x && y || z", // right associative?
];

for (const text of bindRight) {
  Deno.test(`bind right case '${text}'`, () => {
    assertEquals(
      new Trees(getFrames(text)).toString(),
      "(0:Stmts (0:Stmt (1:ExprTail 0:ExprHead (3:ExprTail 2:ExprHead 4:ExprHead))))",
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
    assertEquals(
      new Trees(getFrames(text)).toString(),
      "(0:Stmts (0:Stmt (1:ExprTail 0:ExprHead (2:ExprHead (4:ExprTail 3:ExprHead 5:ExprHead)))))",
    );
  });
}

const bindLeft = [
  "x == y && z",
  "x || y = z", // hmmm
  "x != y || z",
  "x < y && z",
];

for (const text of bindLeft) {
  Deno.test(`bind left case '${text}'`, () => {
    assertEquals(
      new Trees(getFrames(text)).toString(),
      "(0:Stmts (0:Stmt (3:ExprTail (1:ExprTail 0:ExprHead 2:ExprHead) 4:ExprHead)))",
    );
  });
}

const bindLeftForParens = [
  "(x && y) == z",
  "(x || y) = z",
  "(x = y) && z",
  "(x && y) != z",
  "(x || y) < z",
];

for (const text of bindLeftForParens) {
  Deno.test(`bind left case '${text}'`, () => {
    assertEquals(
      new Trees(getFrames(text)).toString(),
      "(0:Stmts (0:Stmt (5:ExprTail (0:ExprHead (2:ExprTail 1:ExprHead 3:ExprHead)) 6:ExprHead)))",
    );
  });
}

Deno.test("with dots cases", () => {
  assertEquals(
    new Trees(getFrames("x.y = z")).toString(),
    "(0:Stmts (0:Stmt (3:ExprTail (1:ExprTail 0:ExprHead 2:Identifier) 4:ExprHead)))",
  );
  assertEquals(
    new Trees(getFrames("x = y.z")).toString(),
    "(0:Stmts (0:Stmt (1:ExprTail 0:ExprHead (3:ExprTail 2:ExprHead 4:Identifier))))",
  );
});

Deno.test("function cases", () => {
  const input = ["f()", "f(x)", "f(x, y)", "f(x, y, z)"];
  const output = [
    "(0:Stmts (0:Stmt (1:ExprTail 0:ExprHead 2:Args)))",
    "(0:Stmts (0:Stmt (1:ExprTail 0:ExprHead (2:Args 2:ExprHead))))",
    "(0:Stmts (0:Stmt (1:ExprTail 0:ExprHead (2:Args 2:ExprHead 4:ExprHead))))",
    "(0:Stmts (0:Stmt (1:ExprTail 0:ExprHead (2:Args 2:ExprHead 4:ExprHead 6:ExprHead))))",
  ];

  for (let i = 0; i < 4; i++) {
    assertEquals(
      new Trees(getFrames(input[i])).toString(),
      output[i],
    );
  }
});

Deno.test("with dots cases", () => {
  goodCases.forEach((
    it,
  ) => (console.log(it), console.log(new Trees(getFrames(it)).str())));
});

function getFrames(text: string) {
  const automaton = new Automaton();
  automaton.readString(text);
  const parser = new Parser();
  parser.visitAll(automaton.types);
  return parser.frames;
}
