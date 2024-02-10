/*
 * Sketched out idea:
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

import { LinkedList } from "./linkedList.ts";
import { Id, Term } from "./model.ts";
import { Parser } from "./parser.ts";
import { RedBlackTreeMap } from "./redBlack2.ts";

type Reducend = [Term, Values, number];
type Values = LinkedList<RedBlackTreeMap<Reducend>>;
type Result = ["tuple", Id, number, Values] | [
  "closure",
  Reducend,
];

export function reduce(term: Term): Result {
  let kappa = 0;
  let values: Values = LinkedList.EMPTY;
  let operands: Values = LinkedList.EMPTY;
  for (;;) {
    switch (term[0]) {
      case "ident": {
        if (values.isEmpty) {
          // weak head normal form 1: tagged tuple
          return ["tuple", term[1], kappa, operands];
        }
        const y: Reducend | undefined = values.head.get(term[1]);
        if (y === undefined) {
          // unresolved variable
          return ["tuple", term[1], kappa, operands];
        }
        [term, values] = y;
        continue;
      }
      case "lambda":
        if (operands.isEmpty) {
          // weak head normal form 2: closure
          return ["closure", [term, values, kappa]];
        }
        values = values.prepend(operands.head); //[operands[0], values];
        operands = operands.tail;
        term = term[1];
        continue;
      case "where":
        if (!operands.isEmpty) {
          operands = operands.tail.prepend(
            operands.head.add(term[2], [term[3], values, kappa]),
          );
        } // else ignore?
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

export const Result = {
  stringify: stringifyResult,
};

function stringifyResult(result: Result): string {
  switch (result[0]) {
    case "tuple":
      return `${"$".repeat(result[2])}${result[1]}${
        stringifyValues(result[3])
      }`;
    case "closure":
      return stringifyReducend(result[1]);
  }
}

function stringifyValues(values: Values): string {
  const objects: string[] = [];
  const pairs = [];
  for (const r of values.entries()) {
    for (const [k, v] of r.entries()) {
      pairs.push(`${k}: ${stringifyReducend(v)}`);
    }
    objects.push(`{${pairs.join(", ")}}`);
    pairs.length = 0;
  }
  return `(${objects.join(", ")})`;
}

function stringifyReducend(reducend: Reducend): string {
  const term = Term.stringify(reducend[0], 2);
  return `${"$".repeat(reducend[2])}${term}${stringifyValues(reducend[1])}`;
}

export function rep(input: string): string {
  return Result.stringify(reduce(new Parser(input).term()));
}
