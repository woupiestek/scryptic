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
type Label = number;
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
  | [Op.Jump, Label] // goto [label]
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

function stringify(ins: Instruction | LimitInstruction): string {
  const [h, ...t] = ins;
  return [Op[h], ...t].join(" ");
}
// possibly missing: constructor instructions
// lacking constructors, nothing to call there.
// something to still figure out.

export type Subroutine = {
  instructions: Instruction[];
  next: LimitInstruction;
};

export class Method {
  constructor(
    readonly size: number,
    readonly body: Subroutine[],
  ) {}
  _strings() {
    return Object.fromEntries(
      Object.entries(this.body).map((
        [k, v],
      ) => [k, v.instructions.map(stringify), stringify(v.next)]),
    );
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
