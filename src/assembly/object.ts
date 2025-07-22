import { Class } from "./class.ts";

export const CLASS = Symbol("class");

export class Instance {
  [CLASS]: Class;
  [x: string]: Value;
  constructor(klaz: Class = new Class()) {
    this[CLASS] = klaz;
  }
}

export type Value = boolean | Class | Instance | string | undefined;
