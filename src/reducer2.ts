import { LinkedList } from "./collections/linkedList.ts";
import { Id, Term } from "./model.ts";
import { RedBlackTreeMap } from "./collections/redBlack2.ts";

type Object = RedBlackTreeMap<Result>;
type Values = LinkedList<Object>;
type Result = ["tuple", Id, number, Values] | [
  "closure",
  Term,
  Values,
  number,
];

function concat(x: Values, y: Values): Values {
  if (x.isEmpty) return y;
  return concat(x.tail, y).prepend(x.head);
}

export function reduce(term: Term, values: Values, kappa: number): Result {
  let operands: Values = LinkedList.EMPTY;
  for (;;) {
    switch (term[0]) {
      case "ident": {
        if (values.isEmpty) {
          // weak head normal form 1: tagged tuple
          return ["tuple", term[1], kappa, operands];
        }
        const y: Result | undefined = values.head.get(term[1]);
        if (y === undefined) {
          // unresolved variable
          return ["tuple", term[1], kappa, operands];
        }
        switch (y[0]) {
          case "tuple":
            return ["tuple", y[1], y[2], concat(y[3], operands)];
          case "closure":
            term = y[1];
            values = y[2];
        }
        continue;
      }
      case "where":
        if (!operands.isEmpty) {
          operands = operands.tail.prepend(
            operands.head.add(term[2], reduce(term[3], values, kappa)),
          );
        } // else ignore?
        term = term[1];
        continue;
      case "lambda":
        if (operands.isEmpty) {
          // weak head normal form 2: closure
          return ["closure", term, values, kappa];
        }
        values = values.prepend(operands.head);
        operands = operands.tail;
        term = term[1];
        continue;
      case "alpha":
        operands = operands.prepend(RedBlackTreeMap.EMPTY);
        term = term[1];
        continue;
      case "kappa":
        if (values.isEmpty) {
          kappa++;
        } else {
          values = values.tail;
        }
        term = term[1];
        continue;
    }
  }
}
