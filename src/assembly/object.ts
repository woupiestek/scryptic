import { Class, Identifier } from "./class.ts";

export type Struct = {
  [_: Identifier]: Value;
};
export type Value =
  | null
  | string
  | number
  | Struct
  | Class;
