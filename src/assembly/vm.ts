import {
  Class,
  Instruction,
  Label,
  LimitInstruction,
  Method,
  Op,
} from "./class.ts";
import { Struct, Value } from "./object.ts";

class Frame {
  static #null = null as unknown;
  #body: Label = Frame.#null as Label;
  #ip = 0;
  stackTop = 0;
  goto(label: Label) {
    this.#body = label;
    this.#ip = 0;
  }
  next(): Instruction | LimitInstruction {
    return this.#ip < this.#body.instructions.length
      ? this.#body.instructions[this.#ip++]
      : this.#body.next;
  }
  load(method: Method, offset: number) {
    this.stackTop = offset + method.size;
    this.goto(method.start);
  }
}

export class VM {
  static MAX_FRAMES = 64;
  frames: Frame[] = [];
  stack: Value[] = [{}];
  fp = 0;
  // good old dependency injection...
  constructor(readonly log: (_: Value) => void = console.log) {
    this.frames = Array.from({ length: VM.MAX_FRAMES }).map((_) => new Frame());
  }
  get(i: number): Value {
    return this.stack[this.frames[this.fp].stackTop - i] || null;
  }
  less(i: number, j: number): boolean {
    const x = this.get(i);
    const y = this.get(j);
    if (x === null || y === null) {
      throw new Error("null pointer found");
    }
    return x < y;
  }
  set(i: number, value: Value) {
    this.stack[this.frames[this.fp].stackTop - i] = value;
  }
  #result: Value = null;
  run(method: Method) {
    this.fp = 0;
    this.frames[this.fp].load(method, 0);
    for (;;) {
      const instruction = this.frames[this.fp].next();
      switch (instruction[0]) {
        case Op.Constant:
          this.set(instruction[1], instruction[2]);
          continue;
        case Op.GetField:
          // this.get(instruction[2]) may not actrually be struct
          // this.get(instruction[2])[instruction[3]] may not be value
          // that is what we need a type checker for
          this.set(
            instruction[1],
            (this.get(instruction[2]) as Struct)[
              instruction[3]
            ],
          );
          continue;
        case Op.Move:
          this.set(instruction[1], this.get(instruction[2]));
          continue;
        case Op.MoveResult:
          this.set(instruction[1], this.#result);
          this.#result = null;
          continue;
        case Op.New:
          this.set(instruction[1], {});
          continue;
        case Op.InvokeStatic:
          this.invoke(
            instruction[1],
            instruction[2],
          );
          continue;
        case Op.InvokeVirtual:
          this.invoke(
            (this.get(instruction[1]) as Class).methods[instruction[2]],
            instruction[3],
          );
          continue;
        case Op.Jump:
          this.frames[this.fp].goto(instruction[1]);
          continue;
        case Op.JumpIfDifferent:
          if (this.get(instruction[2]) !== this.get(instruction[3])) {
            this.frames[this.fp].goto(instruction[1]);
          }
          continue;
        case Op.JumpIfEqual:
          if (this.get(instruction[2]) === this.get(instruction[3])) {
            this.frames[this.fp].goto(instruction[1]);
          }
          continue;
        case Op.JumpIfFalse:
          if (!this.get(instruction[2])) {
            this.frames[this.fp].goto(instruction[1]);
          }
          continue;
        case Op.JumpIfLess:
          if (this.less(instruction[2], instruction[3])) {
            this.frames[this.fp].goto(instruction[1]);
          }
          continue;
        case Op.JumpIfNotMore:
          if (!this.less(instruction[3], instruction[2])) {
            this.frames[this.fp].goto(instruction[1]);
          }
          continue;
        case Op.JumpIfTrue:
          if (this.get(instruction[2])) {
            this.frames[this.fp].goto(instruction[1]);
          }
          continue;
        case Op.Log:
          this.log(this.get(instruction[1]));
          continue;
        case Op.Return:
          if (instruction[1] !== undefined) {
            this.#result = this.get(instruction[1]);
          }
          if (this.fp === 0) return this.#result;
          else {
            this.fp--;
            continue;
          }
        case Op.SetField:
          (this.get(instruction[1]) as Struct)[instruction[2]] = this.get(
            instruction[3],
          );
      }
    }
  }

  private invoke(
    method: Method,
    locals: number[],
  ) {
    if (this.fp >= VM.MAX_FRAMES) throw new Error("stack overflow");
    const f2 = this.frames[this.fp + 1];
    f2.load(method, this.frames[this.fp].stackTop);
    for (let i = 0; i < locals.length; i++) {
      this.stack[f2.stackTop - i] = this.get(locals[i]);
    }
    this.fp++;
  }
}
