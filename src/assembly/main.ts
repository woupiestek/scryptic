import { Compiler } from "./compiler.ts";
import { Lex } from "./lex.ts";
import { VM } from "./vm.ts";
import { Parse } from "./parse.ts";

export function rep(input: string) {
  const compiler = new Compiler(new Parse(new Lex(input)));
  new VM().run(compiler.method, compiler.labels);
}

rep('log "Hello, World!"');
