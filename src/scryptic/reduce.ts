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
        // what if stack is empty?
        stack.pop();
        slice--;
        break;
      case LAMBDA:
        if (stack.length === 0) return [slice, context];
        context = stack.pop() as Context;
        slice--;
        break;
      case IS: {
        const [x, y, z] = Array(term.parents.length).keys().filter((i) =>
          term.parents[i] === slice
        ).toArray();
        slice = x;
        stack[stack.length - 1][term.nodes[y]] = [z, context];
        break;
      }
      default: {
        if (!context[tag]) {
          return [stack, tag];
        }
        [slice, context] = context[tag];
        break;
      }
    }
  }
}
