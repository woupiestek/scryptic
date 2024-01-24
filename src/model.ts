export type Id = string;
export type Term =
  | ["ident", Id]
  | ["where", Term, Id, Term]
  | ["lambda", Term]
  | [
    "alpha",
    Term,
  ]
  | ["kappa", Term];

function stringify(term: Term, level = 3): string {
  switch (term[0]) {
    case "ident":
      return term[1];
    case "where": {
      const b = stringify(term[3], 1);
      const c = stringify(term[1], 2);
      const d = `${term[2]} = ${b}, ${c}`;
      return level < 2 ? `{${d}}` : d;
    }
    case "lambda": {
      const b = `\\${stringify(term[1], 2)}`;
      return level < 1 ? `{${b}}` : b;
    }
    case "alpha": {
      const b = `${stringify(term[1], 2)}.`;
      return level < 3 ? `{${b}}` : b;
    }
    case "kappa": {
      const b = `$${stringify(term[1], 2)}`;
      return level < 1 ? `{${b}}` : b;
    }
  }
}

export const Term = {
  stringify,
};
