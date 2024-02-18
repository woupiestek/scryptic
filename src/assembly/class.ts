export enum Op {
  Constant,
  GetField,
  Move,
  MoveResult,
  New,
  InvokeStatic,
  InvokeVirtual,
  Jump,
  JumpIfLess,
  JumpIfMore,
  JumpIfEqual,
  JumpIfDifferent,
  Print,
  Return,
  SetField,
}

type Local = number;
type Constant = string | number | Class | null;
export type Identifier = string;
export type Record<A> = { [_: Identifier]: A };

export type Instruction =
  | [Op.Constant, Local, Constant] // y = 1
  | [Op.GetField, Local, Local, Identifier] // y = x.i
  | [Op.InvokeStatic, Method, Local[]] // x[0].m(x[1],...,x[arity])
  | [Op.InvokeVirtual, Local, Identifier, Local[]] // x[0].m(x[1],...,x[arity])...
  | [
    Op.JumpIfDifferent | Op.JumpIfEqual | Op.JumpIfLess | Op.JumpIfMore,
    Local,
    Local,
    Identifier,
  ]
  | [Op.JumpIfLess, Local, Local, Identifier]
  | [Op.Move, Local, Local] // y = x
  | [Op.MoveResult, Local] // y = (previous function call)
  | [Op.New, Local] // y = new(); -- constructor methonds may be required, but we  don't need them here.
  | [Op.Print, Local]
  | [Op.SetField, Local, Identifier, Local] // y.i = x
;
export type LimitInstruction =
  | [Op.Jump, Identifier] // goto [label]
  | [Op.Return, Local?] // return; whatever is left on the bottom can be taken as return value
;

function stringify(ins: Instruction | LimitInstruction): string {
  const [h, ...t] = ins;
  return [Op[h], t].join(" ");
}
// possibly missing: constructor instructions
// lacking constructors, nothing to call there.
// something to still figure out.

export type Subroutine = [...Instruction[], LimitInstruction];

export class Method {
  constructor(
    readonly size: number,
    readonly instructions: { //
      start: Subroutine;
      [_: Identifier]: Subroutine;
    },
  ) {}
  _strings() {
    return Object.fromEntries(
      Object.entries(this.instructions).map((
        [k, v],
      ) => [k, v.map(stringify)]),
    );
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
    return JSON.stringify(this._strings, null, 2);
  }
}
