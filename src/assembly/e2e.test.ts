import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { VM } from "./vm.ts";
import { Value } from "./object.ts";
import { Lex } from "./lex.ts";

function compile(input: string) {
  console.log(input);
  const lex = new Lex(input);
  console.log(lex.toString());
  const parser = new Parser(lex);
  return new Compiler(lex.types).compile(parser.script());
}
function run(input: string) {
  const log: Value[] = [];
  new VM((x) => log.push(x)).run(compile(input));
  return log;
}

Deno.test(function helloWorld() {
  assertEquals(run('log "Hello, World!"'), ["Hello, World!"]);
});

Deno.test(function borrowJsonParse() {
  assertEquals(run('log "Hello, \u2260!"'), ["Hello, ≠!"]);
});

Deno.test(function variableDeclaration() {
  assertEquals(run('var x = "Hello, World!"; log x'), ["Hello, World!"]);
});

Deno.test(function assignUndeclared() {
  assertThrows(() => compile('x = "Hello, World!"; log x'));
});

Deno.test(function assignment() {
  assertEquals(
    run(
      'var x;\
    { x = "Hello, World!" }\
    log x',
    ),
    ["Hello, World!"],
  );
});

Deno.test(function reassignment() {
  assertEquals(
    run(
      'var x = "Something else";\
    { x = "Hello, World!" }\
    log x',
    ),
    ["Hello, World!"],
  );
});

Deno.test(function assignmentOutOfScope() {
  assertThrows(() =>
    compile(
      '{ var x = "Hello, World!" } log x',
    )
  );
});

Deno.test(function doubleAssignment() {
  assertThrows(() =>
    compile(
      'var x; { var x = "Hello, World!" } log x',
    )
  );
});

Deno.test(function construction() {
  assertEquals(JSON.stringify(run("var x = new A(); log x")), "[{}]");
});

Deno.test(function newLogOperator() {
  assertEquals(run('var x; log (x = "Hello, World!")'), ["Hello, World!"]);
});

Deno.test(function testFields() {
  assertEquals(run('var x = new A(); x.y = "Hello, World!"; log(x.y)'), [
    "Hello, World!",
  ]);
});

Deno.test(function booleanTrue() {
  // the ;; are not going to stay!
  assertEquals(run('var x = "wrong!"; if true { x = "right!" } log x'), [
    "right!",
  ]);
});

Deno.test(function booleanFalse() {
  assertEquals(
    run(
      'var x = "wrong!"; if false { x = "wrong!" } else { x = "right!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanNot() {
  assertEquals(
    run(
      'var x = "wrong!"; if !true { x = "wrong!" } else { x = "right!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanEquals() {
  const script = 'var x = "wrong!"; if x == "wrong!" { x = "right!" } log x';
  console.log(compile(script).toString());
  assertEquals(run(script), ["right!"]);
});

Deno.test(function booleanDifferent() {
  assertEquals(
    run(
      'var x = "test"; if x != "test" { x = "wrong!" } else { x = "right!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanLess() {
  assertEquals(
    run(
      'var x = "test"; if x < "zzz" { x = "right!" } else { x = "wrong!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanLessOrEqual() {
  assertEquals(
    run(
      'var x = "test"; if x <= "zzz" { x = "right!" } else { x = "wrong!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanMore() {
  assertEquals(
    run(
      'var x = "test"; if x > "zzz" { x = "wrong!" } else { x = "right!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanMoreOrEqual() {
  assertEquals(
    run(
      'var x = "test"; if x >= "zzz" { x = "wrong!" } else { x = "right!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanNotLess() {
  assertEquals(
    run(
      'var x = "test"; if !(x < "zzz") { x = "wrong!" } else { x = "right!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanAnd() {
  assertEquals(
    run(
      'var x = "test"; if x < "zzz" && true { x = "right!" } else { x = "wrong!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanOr() {
  assertEquals(
    run(
      'var x = "test"; if x > "zzz" || true { x = "right!" } else { x = "wrong!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function booleanCompound() {
  assertEquals(
    run(
      'var x = "test"; if !(x > "zzz" || true) { x = "wrong!" } else { x = "right!" } log x',
    ),
    [
      "right!",
    ],
  );
});

Deno.test(function partialAssignment() {
  // compile error now, because there are branches.
  // a more intelligent compoiler mihght remove the problem branch, but it would need
  // function arguments to work with.
  assertThrows(() =>
    compile(
      'var x; if true { x = "wrong!" } log x',
    )
  );
});

Deno.test(function doubleAssignment() {
  assertEquals(
    run(
      'var x; var y = new A(); x = y.m = "test"; if x == "test" { log "right!" } else { log "wrong!" }',
    ),
    ["right!"],
  );
});

Deno.test(function whileStatements() {
  const script = 'var x = "wrong!"; while x != "right!" { x = "right!" } log x';
  console.log(compile(script).toString());
  assertEquals(run(script), ["right!"]);
});

Deno.test(function breakStatements() {
  assertEquals(
    run(
      'var x = "wrong!"; while true { x = "right!"; break } log x',
    ),
    ["right!"],
  );
});

Deno.test(function continueStatements() {
  assertEquals(
    run(
      'var x = "wrong!"; while !false { if x == "right!" { break } else { x = "right!"; continue } } log x',
    ),
    ["right!"],
  );
});

Deno.test(function labelsStatements() {
  const script =
    'var x = "wrong!"; #a while true \{ if x != "right!" \{ x = "right!"; continue #a \} break #a \} log x';
  console.log(compile(script).toString());
  assertEquals(run(script), ["right!"]);
});

Deno.test(function nestedVarDeclaration() {
  assertEquals(
    run(
      '(var x = new A()).y = "right!"; log(x.y)',
    ),
    ["right!"],
  );
});

Deno.test(function classesAndMethods() {
  const script = 'class A { run(){ log "right!" } } new A().run()';
  console.log(compile(script).toString());
  assertEquals(run(script), ["right!"]);
});

Deno.test(function constructors() {
  assertEquals(run('class A { new(){ log "right!" } } new A()'), ["right!"]);
});

Deno.test(function returns() {
  assertEquals(run('class A { run(){ return "right!" } } log(new A().run())'), [
    "right!",
  ]);
});

Deno.test(function passParameter() {
  const script = 'class A { print(x){ log x } } new A().print("right!")';
  assertEquals(run(script), ["right!"]);
});

Deno.test(function passParameterToConstructor() {
  const script = 'class A { new(x){ log x } } new A("right!")';
  assertEquals(run(script), ["right!"]);
});

Deno.test(function testThis() {
  const script = 'class A { new(x){ this.x = x } } log(new A("right!").x)';
  assertEquals(run(script), ["right!"]);
});
