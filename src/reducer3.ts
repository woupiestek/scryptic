import { LinkedList, LinkedLists } from "./collections/linkedList.ts";
import { Parser, stringifyTerm, Term } from "./parser3.ts";
import { RedBlackTreeMap } from "./collections/redBlack2.ts";

type Reducend = [Term, Values, number];
type Values = LinkedList<RedBlackTreeMap<Reducend>>;
type Result = ["tuple", string, number, Values] | [
  "closure",
  Reducend,
];

const LL = new LinkedLists<RedBlackTreeMap<Reducend>>();

export function reduce(term: Term): Result {
  let kappa = 0;
  let values: Values = LL.EMPTY;
  let operands: Values = LL.EMPTY;
  for (;;) {
    switch (term[0]) {
      case 0: {
        if (LL.isEmpty(values)) {
          return ["tuple", term[1], kappa, operands];
        }
        const y: Reducend | undefined = LL.head(values).get(term[1]);
        if (y === undefined) {
          let k = kappa;
          for (const _ of LL.entries(values)) {
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
              operands = LL.cons(
                LL.isEmpty(values) ? RedBlackTreeMap.EMPTY : LL.head(values),
                operands,
              );
              continue;
            case "K":
              if (LL.isEmpty(values)) {
                kappa++;
              } else {
                values = LL.tail(values);
              }
              continue;
            case "L":
              if (LL.isEmpty(operands)) {
                // weak head normal form 2: closure
                return ["closure", [
                  [term[0], term[1].slice(i), term[2]],
                  values,
                  kappa,
                ]];
              }
              values = LL.cons(LL.head(operands), values);
              operands = LL.tail(operands);
              continue;
          }
        }
        term = term[2];
        continue;
      case 2:
        if (LL.isEmpty(values)) {
          values = LL.cons(RedBlackTreeMap.EMPTY, values);
          kappa++;
        }
        for (const [k, v] of term[2]) {
          values = LL.cons(
            LL.head(values).add(k, [v, values, kappa]),
            LL.tail(values),
          );
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
  for (const reducend of LL.entries(values)) {
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
