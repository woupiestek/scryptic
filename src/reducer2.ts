import { LinkedList, LinkedLists } from "./collections/linkedList.ts";
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

const LL = new LinkedLists<Object>();

function concat(x: Values, y: Values): Values {
  if (LL.isEmpty(x)) return y;
  return LL.cons(LL.head(x), concat(LL.tail(x), y));
}

export function reduce(term: Term, values: Values, kappa: number): Result {
  let operands: Values = LL.EMPTY;
  for (;;) {
    switch (term[0]) {
      case "ident": {
        if (LL.isEmpty(values)) {
          // weak head normal form 1: tagged tuple
          return ["tuple", term[1], kappa, operands];
        }
        const y: Result | undefined = LL.head(values).get(term[1]);
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
        if (!LL.isEmpty(operands)) {
          operands = LL.cons(
            LL.head(operands).add(term[2], reduce(term[3], values, kappa)),
            LL.tail(operands),
          );
        } // else ignore?
        term = term[1];
        continue;
      case "lambda":
        if (LL.isEmpty(operands)) {
          // weak head normal form 2: closure
          return ["closure", term, values, kappa];
        }
        values = LL.cons(LL.head(operands), values);
        operands = LL.tail(operands);
        term = term[1];
        continue;
      case "alpha":
        operands = LL.cons(RedBlackTreeMap.EMPTY, operands);
        term = term[1];
        continue;
      case "kappa":
        if (LL.isEmpty(values)) {
          kappa++;
        } else {
          values = LL.tail(values);
        }
        term = term[1];
        continue;
    }
  }
}
