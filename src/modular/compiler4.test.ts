import { Compiler } from "./compiler4.ts";

Deno.test("pretext cases", () => {
  new Compiler("a == b && c != d");
});
