import { Compiler } from "./compiler.ts";
import { Parser } from "./parser.ts";
import { VM } from "./vm.ts";

export function rep(input: string) {
  new VM().run(new Compiler(new Parser(input).script()).compile());
}

rep('print "Hello, World!";');
