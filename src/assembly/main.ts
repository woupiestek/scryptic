import { Compiler } from "./compiler.ts";
import { Lex } from "./lex.ts";
import { VM } from "./vm.ts";
import { Parse } from "./parse.ts";

export function rep(input: string) {
  new VM().run(new Compiler(new Parse(new Lex(input))).method);
}

rep('log "Hello, World!"');
