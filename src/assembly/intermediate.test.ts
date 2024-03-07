import { Block, Parser } from "./parser.ts";
import { Grapher } from "./intermediate.ts";
import { Token } from "./lexer.ts";

function run(input: string) {
  const parseResult = new Parser(input).script();
  console.log(input);
  console.log(
    new Grapher().compile(
      new Block(
        new Token(0, 0, 0, 0, 0),
        parseResult.filter((it) => it instanceof Block),
      ),
    ).toString(),
  );
}

run('log "Hello, World!"');

run('log "Hello, \u2260!"');

run('var x = "Hello, World!"; log x');

run('x = "Hello, World!"; log x');

run(
  'var x;\
      { x = "Hello, World!" }\
      log x',
);
run(
  'var x = "Something else";\
      { x = "Hello, World!" }\
      log x',
);
run(
  '{ var x = "Hello, World!" } log x',
);

run(
  'var x; { var x = "Hello, World!" } log x',
);

run("var x = new A(); log x");

run('var x; log (x = "Hello, World!")');

run('var x = new A(); x.y = "Hello, World!"; log(x.y)');

run('var x = "wrong!"; if true { x = "right!" } log x');
run(
  'var x = "wrong!"; if false { x = "wrong!" } else { x = "right!" } log x',
);
run(
  'var x = "wrong!"; if !true { x = "wrong!" } else { x = "right!" } log x',
);
run('var x = "wrong!"; if x == "wrong!" { x = "right!" } log x');

run(
  'var x = "test"; if x != "test" { x = "wrong!" } else { x = "right!" } log x',
);
run(
  'var x = "test"; if x < "zzz" { x = "right!" } else { x = "wrong!" } log x',
);
run(
  'var x = "test"; if x <= "zzz" { x = "right!" } else { x = "wrong!" } log x',
);
run(
  'var x = "test"; if x > "zzz" { x = "wrong!" } else { x = "right!" } log x',
);
run(
  'var x = "test"; if x >= "zzz" { x = "wrong!" } else { x = "right!" } log x',
);
run(
  'var x = "test"; if !(x < "zzz") { x = "wrong!" } else { x = "right!" } log x',
);
run(
  'var x = "test"; if x < "zzz" && true { x = "right!" } else { x = "wrong!" } log x',
);
run(
  'var x = "test"; if x > "zzz" || true { x = "right!" } else { x = "wrong!" } log x',
);
run(
  'var x = "test"; if !(x > "zzz" || true) { x = "wrong!" } else { x = "right!" } log x',
);

run(
  'var x; if true { x = "wrong!" } log x',
);

run(
  'var x; var y = new A(); x = y.m = "test"; if x == "test" { log "right!" } else { log "wrong!" }',
);
run('var x = "wrong!"; while x != "right!" { x = "right!" } log x');

// run(
//   'var x = "wrong!"; while true { x = "right!"; break } log x',
// );
// run(
//   'var x = "wrong!"; while !false { if x == "right!" { break } else { x = "right!"; continue } } log x',
// );
// run(
//   'var x = "wrong!"; #a while true \{ if x != "right!" \{ x = "right!"; continue #a \} break #a \} log x',
// );

// run(
//   '(var x = new A()).y = "right!"; log(x.y)',
// );

// run('class A { run(){ log "right!" } } new A().run()');

// run('class A { new(){ log "right!" } } new A()');

// run('class A { run(){ return "right!" } } log(new A().run())');
// run('class A { print(x){ log x } } new A().print("right!")');

// run('class A { new(x){ log x } } new A("right!")');

// run('class A { new(x){ this.x = x } } log(new A("right!").x)');
