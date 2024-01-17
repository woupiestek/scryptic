import { RedBlackTreeMap } from "./redBlack.ts";

type Id = string;
type Term = ["ident", Id] | ["where", Term, Id, Term] | ["lambda", Term] | [
  "force",
  Term,
] | ["thunk", Term];

type Object = RedBlackTreeMap<Result>;
type Values = [Object, null | Values];
type Result = ["tuple", Id, number, null | Values] | ["fail", Id] | [
  "closure",
  Term,
  number | Values,
];

function concat(x: null | Values, y: null | Values): null | Values {
  if (x === null) return y;
  return [x[0], concat(x[1], y)];
}

export function reduce(term: Term, values: number | Values): Result {
  let operands: null | Values = null;
  for (;;) {
    switch (term[0]) {
      case "ident": {
        if (typeof values === "number") {
          // weak head normal form 1: tagged tuple
          return ["tuple", term[1], values, operands];
        }
        const y: Result | undefined = values[0].get(term[1]);
        if (y === undefined) {
          // unresolved variable
          return ["fail", term[1]];
        }
        switch (y[0]) {
          case "tuple":
            return ["tuple", y[1], y[2], concat(y[3], operands)];
            // todo
          case "fail":
            return y;
          case "closure":
            term = y[1];
            values = y[2];
            continue;
        }
        continue;
      }
      case "where":
        if (operands !== null) {
          operands[0].set(term[2], reduce(term[3], values));
        } // else ignore?
        term = term[1];
        continue;
      case "lambda":
        if (operands === null) {
          // weak head normal form 2: closure
          return ["closure", term, values];
        }
        if (typeof values === "number" && values !== 0) {
          values--;
        } else {
          values = [operands[0], values || null];
        }
        operands = operands[1];
        term = term[1];
        continue;
      case "force":
        operands = [new RedBlackTreeMap(), operands];
        term = term[1];
        continue;
      case "thunk":
        if (typeof values === "number") {
          values++;
        } else {
          values = values[1] || 0;
        }
        term = term[1];
        continue;
    }
  }
}
