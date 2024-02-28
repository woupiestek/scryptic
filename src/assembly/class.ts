export enum Op {
  Constant,
  GetField,
  Move,
  MoveResult,
  New,
  InvokeStatic,
  InvokeVirtual,
  Jump,
  JumpIfDifferent,
  JumpIfEqual,
  JumpIfFalse,
  JumpIfLess,
  JumpIfNotMore,
  JumpIfTrue,
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
  | [Op.InvokeStatic, Method, Register[]] // x[0].m(x[1],...,x[arity])
  | [Op.InvokeVirtual, Register, Identifier, Register[]] // x[0].m(x[1],...,x[arity])...
  | [
    Op.JumpIfDifferent | Op.JumpIfEqual | Op.JumpIfLess | Op.JumpIfNotMore,
    Register,
    Register,
    Label,
  ]
  | [
    Op.JumpIfTrue | Op.JumpIfFalse,
    Register,
    Label,
  ]
  //| [Op.Jump, Label] // goto [label]
  | [Op.Move, Register, Register] // y = x
  | [Op.MoveResult, Register] // y = (previous function call)
  | [Op.New, Register] // y = new(); -- constructor methonds may be required, but we  don't need them here.
  | [Op.Log, Register]
  | [Op.SetField, Register, Identifier, Register] // y.i = x
;
export type LimitInstruction =
  | [Op.Jump, Label] // goto [label]
  | [Op.Return, Register?] // return; whatever is left on the bottom can be taken as return value
;

export class Label {
  readonly instructions: Instruction[] = [];
  next: LimitInstruction;
  constructor(next: LimitInstruction) {
    this.next = next;
  }
}

export class Method {
  constructor(
    readonly size: number,
    readonly start: Label,
  ) {}
  _strings() {
    const labels = [this.start];
    const results = [];
    function _labelId(x: Label) {
      const i = labels.indexOf(x);
      if (i === -1) {
        const j = labels.length;
        labels[j] = x;
        return j;
      }
      return i.toString();
    }
    for (let i = 0; i < labels.length; i++) {
      results[i] = [...labels[i].instructions, labels[i].next].map(
        ([h, ...t]) => {
          return [Op[h], ...t.map((i) => i instanceof Label ? _labelId(i) : i)]
            .join(" ");
        },
      );
    }
    return results;
  }
  toString() {
    return JSON.stringify(this._strings(), null, 2);
  }
}

export class Class {
  constructor(
    readonly methods: Record<Method>,
  ) {}
  _strings() {
    return Object.fromEntries(
      Object.entries(this.methods).map(([k, v]) => [k, v._strings()]),
    );
  }
  toString() {
    return JSON.stringify(this._strings(), null, 2);
  }
}
