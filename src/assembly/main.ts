import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { VM } from "./vm.ts";

export function rep(input: string) {
  new VM(new Compiler(new Parser(input).script()).compile()).run();
}

rep('print "Hello, World!";');
