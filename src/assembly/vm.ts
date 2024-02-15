import { Class, Instruction, LimitInstruction, Method, Op } from "./class.ts";
import { Struct, Value } from "./object.ts";

class Frame {
  label = "start";
  ip = 0;
  constructor(readonly method: Method, readonly sp: number) {}
  next(): Instruction | LimitInstruction {
    return this.method.instructions[this.label][this.ip++];
  }
}

export class VM {
  run(main: Method) {
    const frames: Frame[] = [];
    const stack: Value[] = [null];
    let frame: Frame = new Frame(main, 0);
    for (;;) {
      const instruction = frame.next();
      switch (instruction[0]) {
        case Op.Constant:
          stack[frame.sp + instruction[1]] = instruction[2];
          continue;
        case Op.GetField: {
          stack[frame.sp + instruction[1]] =
            (stack[frame.sp + instruction[2]] as Struct)[instruction[3]];
          continue;
        }
        case Op.Move:
          stack[frame.sp + instruction[1]] = stack[frame.sp + instruction[2]];
          continue;
        case Op.InvokeStatic: {
          // I have to make an off-by-one error somewhere... right?
          const sp = frame.sp + instruction[1];
          frames.push(frame);
          frame = new Frame(instruction[2], sp);
          continue;
        }
        case Op.InvokeVirtual: {
          const sp = frame.sp + instruction[1];
          frames.push(frame);
          frame = new Frame(
            (stack[frame.sp + instruction[2]] as Class)
              .methods[instruction[3]],
            sp,
          );
          continue;
        }
        case Op.Jump: {
          frame.label = instruction[1];
          frame.ip = 0;
          continue;
        }
        case Op.JumpUnless:
          if (!stack[frame.sp + instruction[1]]) {
            frame.label = instruction[2];
            frame.ip = 0;
          }
          continue;
        case Op.Return: {
          const caller = frames.pop();
          if (caller) {
            frame = caller;
            continue;
          }
          return stack[frame.sp];
        }
        case Op.SetField:
          (stack[frame.sp + instruction[1]] as Struct)[instruction[2]] =
            stack[frame.sp + instruction[1]];
      }
    }
  }
}
