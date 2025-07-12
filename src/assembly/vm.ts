import {
  Class,
  Instruction,
  Label,
  Labels,
  Method,
  NULL_LABEL,
  Op,
} from "./class.ts";
import { CLASS, Instance, Value } from "./object.ts";

class Frame {
  #body: Label = NULL_LABEL;
  #ip = 0;
  stackTop = 0;
  goto(label: Label) {
    this.#body = label;
    this.#ip = 0;
  }
  next(labels: Labels): Instruction {
    if (this.#ip < labels.instructions(this.#body).length) {
      return labels.instructions(this.#body)[this.#ip++];
    }
    if (labels.next(this.#body) !== NULL_LABEL) {
      this.goto(labels.next(this.#body));
      return this.next(labels);
    }
    return [Op.Return];
  }
  load(method: Method, offset: number) {
    this.stackTop = offset + method.size;
    this.goto(method.start);
  }
}

export class VM {
  static MAX_FRAMES = 64;
  frames: Frame[] = [];
  // a place to put global functions like 'log'
  stack: Value[] = [new Instance()];
  fp = 0;
  // good old dependency injection...
  constructor(
    readonly log: (_: Value) => void = console.log,
  ) {
    this.frames = Array.from({ length: VM.MAX_FRAMES }).map((_) => new Frame());
  }
  get(i: number): Value {
    return this.stack[this.frames[this.fp].stackTop - i] || null;
  }
  classOf(i: number): Class {
    const instance: Value = this.get(i);
    if (instance instanceof Instance) {
      return instance[CLASS];
    }
    throw new Error(`value ${JSON.stringify(instance)} has no class`);
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
  run(method: Method, labels: Labels) {
    this.fp = 0;
    this.frames[this.fp].load(method, 0);
    for (;;) {
      const instruction = this.frames[this.fp].next(labels);
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
            (this.get(instruction[2]) as Instance)[
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
          this.set(instruction[1], new Instance(instruction[2]));
          continue;
        case Op.InvokeStatic:
          this.invoke(instruction[1], instruction[2]);
          continue;
        case Op.InvokeVirtual:
          this.invoke(
            this.classOf(instruction[2][0]).method(instruction[1]),
            instruction[2],
          );
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
          (this.get(instruction[1]) as Instance)[instruction[2]] = this.get(
            instruction[3],
          );
      }
    }
  }

  private invoke(
    method: Method,
    locals: number[],
  ) {
    if (method.arity !== locals.length - 1) {
      throw new Error(
        `arity mismatch: ${method.arity} demanded ${
          locals.length - 1
        } supplied`,
      );
    }
    if (this.fp >= VM.MAX_FRAMES) throw new Error("stack overflow");
    const f2 = this.frames[this.fp + 1];
    f2.load(method, this.frames[this.fp].stackTop);
    for (let i = 0; i < locals.length; i++) {
      this.stack[f2.stackTop - i] = this.get(locals[i]);
    }
    this.fp++;
  }
}
