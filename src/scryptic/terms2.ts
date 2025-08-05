export const ALPHA = "\u03b1";
export const KAPPA = "\u03ba";
export const LAMBDA = "\u03bb";

function h(string: string) {
  let hash = 3037000500;
  for (let i = string.length; i >= 0; i--) {
    hash = Math.imul(hash + string.charCodeAt(i), 37) >>> 0;
  }
  return hash;
}

type Term = number & { readonly __tag: unique symbol };

enum Type {
  VAR,
  ALPHA,
  KAPPA,
  LAMBDA,
  BE,
}

export class Terms {
  #strings: string[] = [];

  #string(string: string) {
    const key = h(string);
    this.#strings[key] = string;
    return key;
  }

  #alphas: Term[] = [];
  #kappas: Term[] = [];
  #lambdas: Term[] = [];
  // be
  #keys: number[] = [];
  #values: Term[] = [];
  #bodies: Term[] = [];

  get(name: string): Term {
    return (this.#string(name) * 8 + Type.VAR) as Term;
  }

  alpha(term: Term): Term {
    return ((this.#alphas.push(term) - 1) * 8 + Type.ALPHA) as Term;
  }

  kappa(term: Term): Term {
    return ((this.#kappas.push(term) - 1) * 8 + Type.KAPPA) as Term;
  }

  lambda(term: Term): Term {
    return ((this.#lambdas.push(term) - 1) * 8 + Type.LAMBDA) as Term;
  }

  put(key: string, value: Term, body: Term): Term {
    this.#keys.push(this.#string(key));
    this.#values.push(value);
    return (this.#bodies.push(body) - 1 + Type.BE) as Term;
  }

  stringify(term: Term, strings: string[] = []): string {
    const index = term / 8 | 0;
    switch (term & 7) {
      case Type.ALPHA:
        return strings[term] ??= ALPHA + " " +
          this.stringify(this.#alphas[index]);
      case Type.BE:
        return strings[term] ??= this.#strings[this.#keys[index]] + " = " +
          this.stringify(this.#values[index]) + "; " +
          this.stringify(this.#bodies[index]);
      case Type.KAPPA:
        return strings[term] ??= KAPPA + " " +
          this.stringify(this.#kappas[index]);
      case Type.LAMBDA:
        return strings[term] ??= LAMBDA + " " +
          this.stringify(this.#lambdas[index]);
      case Type.VAR:
        return strings[term] ??= this.#strings[index];
      default:
        return "|ERROR|";
    }
  }

  reduce(term: Term) {
    const args: (Map | undefined)[] = [];
    const context: (Map | undefined)[] = [];
    for (;;) {
      const index = term / 8 | 0;
      switch (term & 7) {
        case Type.ALPHA:
          args.push(context.pop());
          term = this.#alphas[index];
          continue;
        case Type.BE:
          context[0] = Map.cons(this.#keys[index], {
            term: this.#values[index],
            context: context[0],
          }, context[0]);
          term = this.#bodies[index];
          continue;
        case Type.KAPPA:
          context.pop();
          term = this.#kappas[index];
          continue;
        case Type.LAMBDA:
          if (args.length > 0) {
            context.push(args.pop());
            term = this.#lambdas[index];
            continue;
          }
          return { term, context };
        case Type.VAR: {
          const reducend = Map.find(index, context.pop());
          if (!reducend) {
            return [args, this.#strings[index]];
          }
          term = reducend.term;
          context.push(reducend.context);
        }
      }
    }
  }
}

type Map = { key: number; value: Reducend; tail?: Map };
const Map = {
  cons: (key: number, value: Reducend, tail?: Map) => ({ key, value, tail }),
  find: (key: number, map?: Map) => {
    for (;;) {
      if (map === undefined) return undefined;
      if (map.key === key) return map.value;
      map = map.tail;
    }
  },
};
type Reducend = { term: Term; context?: Map };
