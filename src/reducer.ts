/*
 * Stretched out idea:
 * Take for granted that functions always apply to tuples of arguments
 * Let abstracting always abstratc over all variables
 * Problem: how to get partial applied functions?
 * Solution: Firstly, deBruijn indices: abstract over variables with index 0,
 *  reduce index of others. Secondly, instead of indexing every variable, have
 *  an operator raise the index of all contained variables.
 *
 * More spelled out: identifiers are variables with index 0. Lambda abstraction
 *  automatically binds all. The force operator starts the application to an empty
 *  tuple, that is gradually filled in with the where operator. The thunk operator
 *  raises all indices in a subterm with one, taking variable out of range of the
 *  nearest abstraction.
 *
 * This is amazing: the algorithm computes the index of the variable, if thunk
 * requires it.
 */

import { RedBlackTreeMap } from "./redBlack.ts";

type Id = string;
type Term = ["ident", Id] | ["where", Term, Id, Term] | ["lambda", Term] | [
  "force",
  Term,
] | ["thunk", Term];
type Reducend = [Term, number | Values];
type Object = RedBlackTreeMap<Reducend>;
type Values = [Object, null | Values];
type Result = ["tuple", Id, number, null | Values] | ["fail", Id] | [
  "closure",
  Reducend,
];

export function reduce(term: Term): Result {
  let values: number | Values = 0;
  let operands: null | Values = null;
  for (;;) {
    switch (term[0]) {
      case "ident": {
        if (typeof values === "number") {
          // weak head normal form 1: tagged tuple
          return ["tuple", term[1], values, operands];
        }
        const y: Reducend | undefined = values[0].get(term[1]);
        if (y === undefined) {
          // unresolved variable
          return ["fail", term[1]];
        }
        [term, values] = y;
        continue;
      }
      case "where":
        if (operands !== null) {
          operands[0].set(term[2], [term[3], values]);
        } // else ignore?
        term = term[1];
        continue;
      case "lambda":
        if (operands === null) {
          // weak head normal form 2: closure
          return ["closure", [term, values]];
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
