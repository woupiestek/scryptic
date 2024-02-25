import { Class, Identifier } from "./class.ts";

export type Struct = {
  [_: Identifier]: Value;
};
export type Value = boolean | null | string | number | Struct | Class;
