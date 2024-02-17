export enum Op {
  // Add,
  // Divide,
  // Equal,
  // Greater,
  // Less,
  // Multiply,
  // Negative,
  // Not,
  // Print,
  // Subtract,
  // Call,
  Constant,
  GetField,
  Move,
  MoveResult,
  InvokeStatic,
  InvokeVirtual,
  Jump,
  JumpUnless,
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
  | [Op.InvokeVirtual, Local, Identifier, Local[]] // x[0].m(x[1],...,x[arity])... 
  | [Op.InvokeStatic, Method, Local[]] // x[0].m(x[1],...,x[arity])
  | [Op.JumpUnless, Local, Identifier] // unless x goto [label]
  | [Op.Move, Local, Local] // y = x
  | [Op.MoveResult, Local] // y = (previous function call)
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

export class Method {
  constructor(
    readonly size: number,
    readonly instructions: { //
      start: [...Instruction[], LimitInstruction];
      [_: Identifier]: [...Instruction[], LimitInstruction];
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
