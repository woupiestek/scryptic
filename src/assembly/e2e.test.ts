import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { VM } from "./vm.ts";

function parse(input: string) {
  return new Parser(input).script();
}
function compile(input: string) {
  return new Compiler(parse(input)).compile();
}
function run(input: string) {
  const log: string[] = [];
  new VM((x) => log.push(x)).run(compile(input));
  return log;
}

Deno.test(function helloWorld() {
  const text = run('print "Hello, World!";');
  assertEquals(text, ["Hello, World!"]);
});

Deno.test(function borrowJsonParse() {
  const text = run('print "Hello, \u2260!";');
  assertEquals(text, ["Hello, ≠!"]);
});

Deno.test(function variableDeclaration() {
  assertEquals(run('var x = "Hello, World!"; print x;'), ["Hello, World!"]);
});

Deno.test(function assignUndeclared() {
  assertThrows(() => compile('x = "Hello, World!"; print x;'));
});

Deno.test(function assignment() {
  const text = run(
    'var x;\
    { x = "Hello, World!"; }\
    print x;',
  );
  assertEquals(text, ["Hello, World!"]);
});

Deno.test(function reassignment() {
  const text = run(
    'var x = "Something else";\
    { x = "Hello, World!"; }\
    print x;',
  );
  assertEquals(text, ["Hello, World!"]);
});

Deno.test(function assignmentOutOfScope() {
  assertThrows(() =>
    compile(
      '{ var x = "Hello, World!"; } print x;',
    )
  );
});

Deno.test(function doubleAssignment() {
  assertThrows(() =>
    compile(
      'var x; { var x = "Hello, World!"; } print x;',
    )
  );
});
