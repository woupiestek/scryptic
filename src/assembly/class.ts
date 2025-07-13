import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";

export enum Op {
  Constant,
  GetField,
  Move,
  MoveResult,
  New,
  InvokeStatic,
  InvokeVirtual,
  JumpIfEqual,
  JumpIfFalse,
  JumpIfLess,
  Log,
  Return,
  SetField,
}

type Register = number;
type Constant = string | number | Class | null | boolean;
export type Identifier = string;
export type Record<A> = { [_: Identifier]: A };

export type Instruction =
  | [Op.Constant, Register, Constant] // y = 1
  | [Op.GetField, Register, Register, Identifier] // y = x.i
  | [Op.InvokeStatic, Method, Register[]] // y = x[0].m(x[1],...,x[arity])
  | [Op.InvokeVirtual, Identifier, Register[]] // y = x[0].m(x[1],...,x[arity])...
  | [
    Op.JumpIfEqual | Op.JumpIfLess,
    Label,
    Register,
    Register,
  ]
  | [
    Op.JumpIfFalse,
    Label,
    Register,
  ]
  | [Op.Move, Register, Register] // y = x
  | [Op.MoveResult, Register] // y = (previous function call)
  | [Op.New, Register, Class] // y = new A; -- constructor methods may be required, but we  don't need them here.
  | [Op.Log, Register]
  | [Op.SetField, Register, Identifier, Register] // y.i = x
  | [Op.Return, Register?] // return
;

export type Label = number & { readonly __tag: unique symbol };
export const NULL_LABEL = -1 as Label;

export class Labels {
  #instructions: Instruction[][] = [[]];
  #next: Label[] = [NULL_LABEL];
  label(_next: Label = NULL_LABEL) {
    const l = this.#next.length;
    this.#instructions[l] = [];
    this.#next[l] = _next;
    return l as Label;
  }
  instructions(label: Label) {
    assert(label !== NULL_LABEL);
    return this.#instructions[label];
  }
  next(label: Label, _next?: Label) {
    assert(label !== NULL_LABEL);
    const nl = this.#next[label];
    if (_next !== undefined) {
      this.#next[label] = _next;
    }
    return nl;
  }
  merge() {
    const replace = this.#instructions.keys().toArray() as Label[];
    for (let i = 0; i < replace.length;) {
      if (
        replace[i] === NULL_LABEL || this.#instructions[replace[i]].length > 0
      ) {
        i++;
      } else {
        replace[i] = this.#next[replace[i]];
      }
    }
    for (let i = 0, k = this.#next.length; i < k; i++) {
      if (this.#next[i] !== NULL_LABEL) this.#next[i] = replace[this.#next[i]];
      for (let j = 0, l = this.#instructions[i].length; j < l; j++) {
        const [ij0, ij1] = this.#instructions[i][j];
        if (ij1 === NULL_LABEL) continue;
        switch (ij0) {
          case Op.JumpIfLess:
          case Op.JumpIfEqual:
          case Op.JumpIfFalse:
            this.#instructions[i][j][1] = replace[ij1];
            break;
          default:
            break;
        }
      }
    }
  }

  _strings() {
    const results = [];
    function _string(arg: unknown): unknown {
      if (arg instanceof Array) return arg.join(" ");
      if (arg instanceof Class) return JSON.stringify(arg._strings());
      if (arg instanceof Method) return JSON.stringify(arg._strings());
      return arg;
    }
    for (let i = 0, l = this.#next.length; i < l; i++) {
      results[i] = this.#instructions[i].map(
        ([h, ...t]) => {
          return [Op[h], ...t.map(_string)]
            .join(" ");
        },
      );
      if (this.#next[i] !== -1) results[i].push(`Jump ${this.#next[i]}`);
    }
    return results;
  }
  toString() {
    return this._strings().map((strs, i) =>
      this.#instructions[i].length && [`label ${i}:`, ...strs].join("\n  ")
    ).filter((i) => i).join("\n");
  }
}

export class Method {
  arity = 0;
  size = 0;
  start;
  constructor(labels: Labels) {
    this.start = labels.label();
  }
  _strings() {
    return [this.arity, this.size, this.start];
  }
  toString() {
    return `method(${this.arity}): ${this.start}`;
  }
}

export class Class {
  #methods: Record<Method> = {};
  method(name: string, labels?: Labels) {
    if (!this.#methods[name] && labels) {
      this.#methods[name] ||= new Method(labels);
    }
    return this.#methods[name];
  }
  _strings() {
    return Object.fromEntries(
      Object.entries(this.#methods).map((
        [k, v],
      ) => [`${k}(${v.arity})`, v._strings()]),
    );
  }
  toString() {
    return JSON.stringify(this._strings(), null, 2);
  }
}
