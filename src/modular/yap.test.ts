import { assertThrows } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton } from "./lexer.ts";
import { Parser } from "./yap.ts";

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
