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
  | [Op.InvokeStatic, Method, Register[]] // y = x[0].m(x[1],...,x[arity])
  | [Op.InvokeVirtual, Identifier, Register[]] // y = x[0].m(x[1],...,x[arity])...
  | [
    Op.JumpIfDifferent | Op.JumpIfEqual | Op.JumpIfLess | Op.JumpIfNotMore,
    Label,
    Register,
    Register,
  ]
  | [
    Op.JumpIfTrue | Op.JumpIfFalse,
    Label,
    Register,
  ]
  | [Op.Jump, Label] // goto [label]
  | [Op.Move, Register, Register] // y = x
  | [Op.MoveResult, Register] // y = (previous function call)
  | [Op.New, Register, Class] // y = new A; -- constructor methods may be required, but we  don't need them here.
  | [Op.Log, Register]
  | [Op.SetField, Register, Identifier, Register] // y.i = x
  | [Op.Return, Register?] // return
;

export class Label {
  readonly instructions: Instruction[] = [];
  next?: Label;
  constructor(next?: Label) {
    this.next = next;
  }
}

export class Method {
  constructor(
    readonly arity: number,
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
    function _string(arg: unknown): unknown {
      if (arg instanceof Array) return arg.join(" ");
      if (arg instanceof Class) return JSON.stringify(arg._strings());
      if (arg instanceof Method) return JSON.stringify(arg._strings());
      if (arg instanceof Label) return _labelId(arg);
      return arg;
    }
    for (let i = 0; i < labels.length; i++) {
      const { instructions, next } = labels[i];
      results[i] = instructions.map(
        ([h, ...t]) => {
          return [Op[h], ...t.map(_string)]
            .join(" ");
        },
      );
      if (next !== undefined) results[i].push(`Jump ${_labelId(next)}`);
    }
    return results;
  }
  toString() {
    return JSON.stringify(this._strings(), null, 2);
  }
}

export class Class {
  constructor(
    readonly methods: Record<Method> = {},
  ) {
    // add constructor if missing
    methods.new ||= new Method(0, 0, new Label());
  }
  _strings() {
    return Object.fromEntries(
      Object.entries(this.methods).map((
        [k, v],
      ) => [`${k}(${v.arity})`, v._strings()]),
    );
  }
  toString() {
    return JSON.stringify(this._strings(), null, 2);
  }
}
