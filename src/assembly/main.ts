import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { Lex } from "./parser4.ts";
import { VM } from "./vm.ts";

export function rep(input: string) {
  const lex = new Lex(input);
  const parser = new Parser(lex);
  new VM().run(new Compiler(lex.types).compile(parser.script()));
}

rep('log "Hello, World!"');
