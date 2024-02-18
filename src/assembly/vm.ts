import {
  Class,
  Identifier,
  Instruction,
  LimitInstruction,
  Method,
  Op,
  Subroutine,
} from "./class.ts";
import { Struct, Value } from "./object.ts";

class Frame {
  static #null = null as unknown;
  static START = "start";
  #method: Method = Frame.#null as Method;
  #body: Subroutine = Frame.#null as Subroutine;
  #ip = 0;
  stackTop = 0;
  goto(label: Identifier) {
    this.#body = this.#method.body[label];
    this.#ip = 0;
  }
  next(): Instruction | LimitInstruction {
    return this.#ip < this.#body.instructions.length
      ? this.#body.instructions[this.#ip++]
      : this.#body.next;
  }
  load(method: Method, offset: number) {
    this.stackTop = offset + method.size;
    this.#method = method;
    this.goto(Frame.START);
  }
}

export class VM {
  static MAX_FRAMES = 64;
  frames: Frame[] = [];
  stack: Value[] = [{}];
  fp = 0;
  // good old dependency injection...
  constructor(readonly print = console.log) {
    this.frames = Array.from({ length: VM.MAX_FRAMES }).map((_) => new Frame());
  }
  get(i: number): Value {
    return this.stack[this.frames[this.fp].stackTop - i];
  }
  getNumber(i: number): number {
    const x = this.get(i);
    if (typeof x !== "number") throw new Error("number expected");
    return x;
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
          if (this.get(instruction[1]) !== this.get(instruction[2])) {
            this.frames[this.fp].goto(instruction[3]);
          }
          continue;
        case Op.JumpIfEqual:
          if (this.get(instruction[1]) === this.get(instruction[2])) {
            this.frames[this.fp].goto(instruction[3]);
          }
          continue;
        case Op.JumpIfLess:
          if (this.getNumber(instruction[1]) < this.getNumber(instruction[2])) {
            this.frames[this.fp].goto(instruction[3]);
          }
          continue;
        case Op.JumpIfMore:
          if (this.getNumber(instruction[1]) > this.getNumber(instruction[2])) {
            this.frames[this.fp].goto(instruction[3]);
          }
          continue;
        case Op.Print:
          this.print(this.get(instruction[1]));
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
            instruction[1],
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
