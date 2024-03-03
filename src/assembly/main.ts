import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { VM } from "./vm.ts";

export function rep(input: string) {
  new VM().run(new Compiler().compile(new Parser(input).script()));
}

rep('log "Hello, World!"');
