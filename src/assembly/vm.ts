import { Class, Instruction, LimitInstruction, Method, Op } from "./class.ts";
import { Struct, Value } from "./object.ts";

class Frame {
  label = "start";
  ip = 0;
  stackTop;
  constructor(readonly method: Method, offset: number) {
    this.stackTop = offset + method.size;
  }
  next(): Instruction | LimitInstruction {
    return this.method.instructions[this.label][this.ip++];
  }
  get(stack: Value[], i: number): Value {
    return stack[this.stackTop - i];
  }
  set(stack: Value[], i: number, value: Value) {
    stack[this.stackTop - i] = value;
  }
}

export class VM {
  frames: Frame[] = [];
  stack: Value[] = [null];
  frame: Frame;
  constructor(main: Method) {
    this.frame = new Frame(main, 0);
  }
  get(i: number): Value {
    return this.frame.get(this.stack, i);
  }
  set(i: number, value: Value) {
    this.frame.set(this.stack, i, value);
  }
  run() {
    let result: Value = null;
    for (;;) {
      const instruction = this.frame.next();
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
          this.set(instruction[1], result);
          result = null;
          continue;
        case Op.InvokeStatic:
          this.invoke(
            instruction[1],
            instruction[2],
          );
          continue;
        case Op.InvokeVirtual: {
          this.invoke(
            (this.get(instruction[1]) as Class).methods[instruction[2]],
            instruction[3],
          );
          continue;
        }
        case Op.Jump: {
          this.goto(instruction[1]);
          continue;
        }
        case Op.JumpUnless:
          if (!this.get(instruction[1])) {
            this.goto(instruction[2]);
          }
          continue;
        case Op.Return: {
          if (instruction[1] !== undefined) {
            result = this.get(instruction[1]);
          }
          const caller = this.frames.pop();
          if (caller) {
            this.frame = caller;
            continue;
          }
          return result;
        }
        case Op.SetField:
          (this.get(instruction[1]) as Struct)[instruction[2]] = this.get(
            instruction[1],
          );
      }
    }
  }

  private goto(label: string) {
    this.frame.label = label;
    this.frame.ip = 0;
  }

  private invoke(
    method: Method,
    locals: number[],
  ) {
    const f2 = new Frame(method, this.frame.stackTop);
    for (let i = 0; i < locals.length; i++) {
      f2.set(this.stack, i, this.get(locals[i]));
    }
    this.frames.push(this.frame);
    this.frame = f2;
  }
}
