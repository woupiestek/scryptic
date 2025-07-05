import { ALPHA, IS, KAPPA, LAMBDA, Term } from "./terms.ts";

type Context = {
  [_: string]: Reducend;
};

type Reducend = [number, Context];

export function reduce(term: Term) {
  let slice = term.nodes.length - 1;
  let context: Context = {};
  const stack: Context[] = [];
  for (;;) {
    const tag = term.nodes[slice];
    switch (tag) {
      case ALPHA:
        stack.push({});
        slice--;
        break;
      case KAPPA:
        if (stack.length === 0) {
          return [slice, context];
        }
        stack.pop();
        slice--;
        break;
      case LAMBDA:
        if (stack.length === 0) {
          return [slice, context];
        }
        context = stack.pop() as Context;
        slice--;
        break;
      case IS:
        if (stack.length === 0) {
          return [slice, context];
        } else {
          const z = slice - 1;
          const y = z - term.sizes[z];
          slice = y - term.sizes[y];
          // stack empty?
          stack[stack.length - 1][term.nodes[y]] = [z, context];
          break;
        }
      default: {
        if (!context[tag]) {
          // technically a variable resolution failure!
          return [stack, tag];
        }
        [slice, context] = context[tag];
        break;
      }
    }
  }
}
