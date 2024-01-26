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

import { Id, Term } from "./model.ts";
import { Parser } from "./parser.ts";
import { RedBlackTreeMap } from "./redBlack.ts";

type Reducend = [Term, Values<number>];
type Values<E> = E | [RedBlackTreeMap<Reducend>, Values<E>];
type Result = ["tuple", Id, number, Values<null>] | [
  "closure",
  Reducend,
];

export function reduce(term: Term): Result {
  let values: Values<number> = 0;
  let operands: Values<null> = null;
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
          return ["tuple", term[1], 0, operands];
        }
        [term, values] = y;
        continue;
      }
      case "lambda":
        if (operands === null) {
          // weak head normal form 2: closure
          return ["closure", [term, values]];
        }
        values = [operands[0], values];
        operands = operands[1];
        term = term[1];
        continue;
      case "where":
        if (operands !== null) {
          operands[0] = operands[0].add(term[2], [term[3], values]);
        } // else ignore?
        term = term[1];
        continue;
      case "alpha":
        operands = [new RedBlackTreeMap(), operands];
        term = term[1];
        continue;
      case "kappa":
        if (typeof values === "number") {
          values++;
        } else {
          values = values[1];
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

function stringifyValues(values: Values<null | number>): string {
  const objects: string[] = [];
  const pairs = [];
  for (;;) {
    if (typeof values === "number") {
      objects.push(values.toString());
      break;
    }
    if (values === null) break;
    for (const [k, v] of values[0].entries()) {
      pairs.push(`${k}: ${stringifyReducend(v)}`);
    }
    objects.push(`{${pairs.join(", ")}}`);
    pairs.length = 0;
    values = values[1];
  }
  return `(${objects.join(", ")})`;
}

function stringifyReducend(reducend: Reducend): string {
  const term = Term.stringify(reducend[0], 2);
  if (typeof reducend[1] === "number") {
    return `${"$".repeat(reducend[1])}${term}`;
  }
  return `${term}${stringifyValues(reducend[1])}`;
}

export function rep(input: string): string {
  return Result.stringify(reduce(new Parser(input).term()));
}
