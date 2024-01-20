export type Id = string;
export type Term =
  | ["ident", Id]
  | ["where", Term, Id, Term]
  | ["lambda", Term]
  | [
    "force",
    Term,
  ]
  | ["thunk", Term];

function stringify(term: Term, level = 3): string {
  switch (term[0]) {
    case "ident":
      return term[1];
    case "where": {
      const b = stringify(term[3], 2);
      const c = stringify(term[1], 3);
      const d = `${term[2]} = ${b}, ${c}`;
      return level < 3 ? `{${d}}` : d;
    }
    case "lambda": {
      const b = `\\${stringify(term[1], 2)}`;
      return level < 2 ? `{${b}}` : b;
    }
    case "force": {
      return `${stringify(term[1], 1)}.`;
      // level < 1 should never happen
      //   const b = `${stringify2(term[1],1)}.`;
      //   return level < 1 ? `{${b}}` : b;
    }
    case "thunk": {
      const b = `$${stringify(term[1], 2)}`;
      return level < 2 ? `{${b}}` : b;
    }
  }
}

export const Term = {
  stringify,
};
