import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { VM } from "./vm.ts";

function run(input: string) {
  const log: string[] = [];
  new VM((x) => log.push(x)).run(
    new Compiler(new Parser(input).script()).compile(),
  );
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

// missing var declarations?
Deno.test(function assigment() {
  const text = run('x = "Hello, World!"; print x;');
  assertEquals(text, ["Hello, World!"]);
});

Deno.test(function reassignment() {
  const text = run(
    'x = "Something else";\
    { x = "Hello, World!"; }\
    print x;',
  );
  assertEquals(text, ["Hello, World!"]);
});

Deno.test(function assignmentOutOfScope() {
  const text = run(
    '{ x = "Hello, World!"; } print x;',
  );
  assertEquals(text, ["null"]);
});
