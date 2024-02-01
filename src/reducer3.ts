import { Parser, stringifyTerm, Term } from "./parser3.ts";
import { RedBlackTreeMap } from "./redBlack.ts";

type Reducend = [Term, Values, number];
type Values = null | [RedBlackTreeMap<Reducend>, Values];
type Result = ["tuple", string, number, Values] | [
  "closure",
  Reducend,
];

export function reduce(term: Term): Result {
  let kappa = 0;
  let values: Values = null;
  let operands: Values = null;
  for (;;) {
    switch (term[0]) {
      case 0: {
        if (values === null) {
          return ["tuple", term[1], kappa, operands];
        }
        const y: Reducend | undefined = values[0].get(term[1]);
        if (y === undefined) {
          let k = kappa;
          let v: Values = values;
          while (v != null && k > 0) {
            k--;
            v = v[1];
          }
          return ["tuple", term[1], k, operands];
        }
        [term, values, kappa] = y;
        continue;
      }
      case 1:
        for (let i = 0, l = term[1].length; i < l; i++) {
          switch (term[1][i]) {
            case "A":
              if (values === null) {
                operands = [new RedBlackTreeMap(), operands];
                kappa++;
              } else {
                operands = [values[0], operands];
                values = values[1];
              }
              continue;
            case "K":
              if (values === null) {
                kappa++;
              } else {
                values = values[1];
              }
              continue;
            case "L":
              if (operands === null) {
                // weak head normal form 2: closure
                return ["closure", [
                  [term[0], term[1].slice(i), term[2]],
                  values,
                  kappa,
                ]];
              }
              values = [operands[0], values];
              operands = operands[1];
              continue;
            case "W":
              if (values === null) {
                values = [new RedBlackTreeMap(), values];
              } else {
                values = [values[0], values];
              }
              continue;
          }
        }
        term = term[2];
        continue;
      case 2:
        if (values === null) {
          values = [new RedBlackTreeMap(), null];
          kappa++;
        }
        for (const [k, v] of term[2]) {
          values[0] = values[0].add(k, [v, values, kappa]);
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
  const values = stringifyValues(reducend[1]);
  return `${"$".repeat(reducend[2])}${term}${values}`;
}

export function rep(input: string): string {
  return Result.stringify(reduce(new Parser(input).term()));
}
