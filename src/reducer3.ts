import { LinkedList } from "./collections/linkedList.ts";
import { Parser, stringifyTerm, Term } from "./parser3.ts";
import { RedBlackTreeMap } from "./collections/redBlack2.ts";

type Reducend = [Term, Values, number];
type Values = LinkedList<RedBlackTreeMap<Reducend>>;
type Result = ["tuple", string, number, Values] | [
  "closure",
  Reducend,
];

export function reduce(term: Term): Result {
  let kappa = 0;
  let values: Values = LinkedList.EMPTY;
  let operands: Values = LinkedList.EMPTY;
  for (;;) {
    switch (term[0]) {
      case 0: {
        if (values.isEmpty) {
          return ["tuple", term[1], kappa, operands];
        }
        const y: Reducend | undefined = values.head.get(term[1]);
        if (y === undefined) {
          let k = kappa;
          for (const _ of values.entries()) {
            if (k > 0) {
              k--;
            } else break;
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
              operands = operands.prepend(
                values.isEmpty ? RedBlackTreeMap.EMPTY : values.head,
              );
              continue;
            case "K":
              if (values.isEmpty) {
                kappa++;
              } else {
                values = values.tail;
              }
              continue;
            case "L":
              if (operands.isEmpty) {
                // weak head normal form 2: closure
                return ["closure", [
                  [term[0], term[1].slice(i), term[2]],
                  values,
                  kappa,
                ]];
              }
              values = values.prepend(operands.head);
              operands = operands.tail;
              continue;
          }
        }
        term = term[2];
        continue;
      case 2:
        if (values.isEmpty) {
          values = values.prepend(RedBlackTreeMap.EMPTY);
          kappa++;
        }
        for (const [k, v] of term[2]) {
          values = values.tail.prepend(values.head.add(k, [v, values, kappa]));
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
  for (const reducend of values.entries()) {
    for (const [k, v] of reducend.entries()) {
      pairs.push(`${k}: ${stringifyReducend(v)}`);
    }
    objects.push(`{${pairs.join(", ")}}`);
    pairs.length = 0;
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
