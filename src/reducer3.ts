import { Id, Term } from "./model.ts";
import { Parser, stringifyTerm } from "./parser3.ts";
import { RedBlackTreeMap } from "./redBlack.ts";

type Reducend = [Term, Values, number];
type Values = null | [RedBlackTreeMap<Reducend>, Values];
type Result = ["tuple", Id, number, Values] | [
  "closure",
  Reducend,
];

export function reduce(term: Term): Result {
  let kappa = 0;
  let values: Values = null;
  let operands: Values = null;
  for (;;) {
    switch (term[0]) {
      case "ident": {
        if (values === null) {
          return ["tuple", term[1], kappa, operands];
        }
        const y: Reducend | undefined = values[0].get(term[1]);
        if (y === undefined) {
          let k = kappa;
          let v: Values = values;
          while (v != null) {
            k--;
            v = v[1];
          }
          return ["tuple", term[1], kappa, operands];
        }
        [term, values, kappa] = y;
        continue;
      }
      case "lambda":
        if (operands === null) {
          // weak head normal form 2: closure
          return ["closure", [term, values, kappa]];
        }
        values = [operands[0], values];
        operands = operands[1];
        term = term[1];
        continue;
      case "where":
        if (values === null) {
          values = [new RedBlackTreeMap(), null];
          kappa++;
        }
        values[0] = values[0].add(term[2], [term[3], values, kappa]);
        term = term[1];
        continue;
      case "alpha":
        operands = [
          values === null ? new RedBlackTreeMap() : values[0],
          operands,
        ];
        term = term[1];
        continue;
      case "kappa":
        if (values === null) {
          kappa++;
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

function stringifyValues(values: Values): string {
  const objects: string[] = [];
  const pairs = [];
  for (;;) {
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
  const term = stringifyTerm(reducend[0], 2);
  if (typeof reducend[1] === "number") {
    return `${"$".repeat(reducend[1])}${term}`;
  }
  return `${"$".repeat(reducend[2])}${term}${stringifyValues(reducend[1])}`;
}

export function rep(input: string): string {
  return Result.stringify(reduce(new Parser(input).term()));
}
