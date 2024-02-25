import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { VM } from "./vm.ts";
import { Value } from "./object.ts";

function parse(input: string) {
  return new Parser(input).script();
}
function compile(input: string) {
  return new Compiler(parse(input)).compile();
}
function run(input: string) {
  const log: Value[] = [];
  new VM((x) => log.push(x)).run(compile(input));
  return log;
}

Deno.test(function helloWorld() {
  assertEquals(run('log "Hello, World!";'), ["Hello, World!"]);
});

Deno.test(function borrowJsonParse() {
  assertEquals(run('log "Hello, \u2260!";'), ["Hello, ≠!"]);
});

Deno.test(function variableDeclaration() {
  assertEquals(run('var x = "Hello, World!"; log x;'), ["Hello, World!"]);
});

Deno.test(function assignUndeclared() {
  assertThrows(() => compile('x = "Hello, World!"; log x;'));
});

Deno.test(function assignment() {
  assertEquals(
    run(
      'var x;\
    { x = "Hello, World!"; }\
    log x;',
    ),
    ["Hello, World!"],
  );
});

Deno.test(function reassignment() {
  assertEquals(
    run(
      'var x = "Something else";\
    { x = "Hello, World!"; }\
    log x;',
    ),
    ["Hello, World!"],
  );
});

Deno.test(function assignmentOutOfScope() {
  assertThrows(() =>
    compile(
      '{ var x = "Hello, World!"; } log x;',
    )
  );
});

Deno.test(function doubleAssignment() {
  assertThrows(() =>
    compile(
      'var x; { var x = "Hello, World!"; } log x;',
    )
  );
});

Deno.test(function construction() {
  assertEquals(run("var x = new; log x;"), [{}]);
});

Deno.test(function shouldThisBeAllowedQ() {
  assertEquals(run('var x; log x = "Hello, World!";'), ["Hello, World!"]);
});

Deno.test(function testFields() {
  assertEquals(run('var x = new; x.y = "Hello, World!"; log x.y;'), [
    "Hello, World!",
  ]);
});

Deno.test(function booleanTrue() {
  // the ;; are not going to stay!
  assertEquals(run('var x = "wrong!"; if true { x = "right!"; } log x;'), [
    "right!",
  ]);
});

Deno.test(function booleanFalse() {
  assertEquals(
    run(
      'var x = "wrong!"; if false { x = "wrong!"; } else { x = "right!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanNot() {
  assertEquals(
    run(
      'var x = "wrong!"; if !true { x = "wrong!"; } else { x = "right!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanEquals() {
  assertEquals(
    run('var x = "wrong!"; if x == "wrong!" { x = "right!"; } log x;'),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanDifferent() {
  assertEquals(
    run(
      'var x = "test"; if x != "test" { x = "wrong!"; } else { x = "right!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanLess() {
  assertEquals(
    run(
      'var x = "test"; if x < "zzz" { x = "right!"; } else { x = "wrong!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanLessOrEqual() {
  assertEquals(
    run(
      'var x = "test"; if x <= "zzz" { x = "right!"; } else { x = "wrong!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanMore() {
  assertEquals(
    run(
      'var x = "test"; if x > "zzz" { x = "wrong!"; } else { x = "right!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanMoreOrEqual() {
  assertEquals(
    run(
      'var x = "test"; if x >= "zzz" { x = "wrong!"; } else { x = "right!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanNotLess() {
  assertEquals(
    run(
      'var x = "test"; if !(x < "zzz") { x = "wrong!"; } else { x = "right!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanAnd() {
  assertEquals(
    run(
      'var x = "test"; if x < "zzz" && true { x = "right!"; } else { x = "wrong!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanOr() {
  assertEquals(
    run(
      'var x = "test"; if x > "zzz" || true { x = "right!"; } else { x = "wrong!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanCompound() {
  assertEquals(
    run(
      'var x = "test"; if !(x > "zzz" || true) { x = "wrong!"; } else { x = "right!"; } log x;',
    ),
    [
      "right!",
    ],
  );
});
