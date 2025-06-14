import { Compiler } from "./compiler3.ts";

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
  'var x = "wrong!"; #a while true \{ if x != "right!" \{ x = "right!"; continue #a \} break #a \} log x',
  'var x = "wrong!"; while true { x = "right!"; break } log x',
  'var x = "wrong!"; while !false { if x == "right!" { break } else { x = "right!"; continue } } log x',
  'var x = "wrong!"; while x != "right!" { x = "right!" } log x',
  "x && y == z;",
  "z = f(x, y);",
  "",
  '(var x = new A()).y = "right!"; log(x.y)',
];

for (const testCode of goodCases) {
  Deno.test(`No blow up on '${testCode}'`, () => {
    console.log(new Compiler(testCode).toString());
  });
}
