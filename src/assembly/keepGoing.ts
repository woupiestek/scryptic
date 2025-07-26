import { UIntSet } from "../collections/uintset.ts";
import { TokenType } from "./lex.ts";
import { NodeType, Parse } from "./parse.ts";
import { StringPool } from "./stringpool.ts";

// label -- instruction -- args --
//
// label: { name?: ... }
// instruction { parent: label, operator }
// value { parent: instruction, class: _, instance:_ }

export enum Type {
  AND,
  BE,
  BRACE_LEFT,
  BREAK,
  CLASS,
  COMMA,
  CONTINUE,
  DOT,
  FALSE,
  IDENTIFIER,
  IF,
  IS_NOT,
  IS,
  LABEL,
  LESS,
  LOG,
  MORE,
  NEW,
  NOT_LESS,
  NOT_MORE,
  NOT,
  OR,
  PAREN_LEFT,
  RETURN,
  STRING,
  THIS,
  TRUE,
  VAR,
  WHILE,
  READ,
  ROOT,
  GOTO,
}

const types: { [_: string]: Type } = {};
Array(32).keys().forEach((key) => {
  types[Type[key]] = key;
});

export class KeepGoing {
  parents: number[] = [];
  types: Type[] = [];
  expressions = new UIntSet();
  targets = new UIntSet();
  pool = new StringPool();
  values: number[] = [];
  deleted = new UIntSet();

  #lexeme(i: number) {
    return this.parse.lex.lexeme(this.parse.tokens[i]);
  }

  constructor(readonly parse: Parse) {
    this.parents = Array(parse.size + 1).keys().toArray();
    for (let i = parse.size; i >= 0; i--) {
      const token = parse.tokens[i];
      const tokenType = parse.lex.types[token];
      this.types[i] = types[TokenType[tokenType]];

      if (this.parse.types[i] === NodeType.EXPR) this.expressions.add(i);
      if (tokenType === TokenType.IDENTIFIER) {
        this.values[i] = this.pool.store(
          this.parse.lex.lexeme(token),
        );
      }
      if (tokenType === TokenType.STRING) {
        this.values[i] = this.pool.store(
          JSON.parse(parse.lex.lexeme(token)),
        );
      }

      for (const j of parse.children(i)) {
        this.parents[j] = i;
      }
    }
    this.types[parse.size] = Type.ROOT;
    // this.#findJumpTargets();
    this.#gotosAndGraph();
    this.#unrollExpressions();
  }

  #gotosAndGraph() {
    const labels: { [_: number]: string } = {};
    const previous: number[] = [];
    const next: number[] = [];
    for (let i = 0; i <= this.parse.size; i++) {
      if (previous[this.parents[i]] !== undefined) {
        next[previous[this.parents[i]]] = i;
      }
      previous[this.parents[i]] = i;
      if (this.types[i] === Type.LABEL) {
        labels[this.parents[i]] = this.#lexeme(i);
        // node can be removed
        this.deleted.add(i);
      }
    }
    for (let i = this.parse.size; i >= 0; i--) {
      if (next[i] === undefined) {
        next[i] = next[this.parents[i]];
      }
      if (
        this.types[i] === Type.BRACE_LEFT &&
        this.types[this.parents[i]] === Type.IF
      ) {
        next[i] = next[this.parents[i]];
      }
    }

    // booleans and blocks still ignored at this stage
    this.types.forEach((type, i) => {
      switch (type) {
        case Type.BRACE_LEFT:
          this.values[this.#addNode(i, Type.GOTO)] = next[i];
          this.targets.add(next[i]);
          return;
        case Type.BREAK:
          {
            const label = labels[i];
            let w = this.parents[i];
            if (label === undefined) {
              while (this.types[w] !== Type.WHILE) {
                if (this.parents[w] === w) {
                  throw new Error("break outside of while");
                }
                w = this.parents[w];
              }
            } else {
              while (w !== this.parents[w] && labels[w] !== label) {
                if (w === this.parents[w]) {
                  throw new Error("labelled break outside of labelled while");
                }
                w = this.parents[w];
              }
            }
            this.types[i] = Type.GOTO;
            this.values[i] = next[w];
            this.targets.add(next[w]);
          }
          return;
        case Type.CONTINUE:
          {
            const label = labels[i];
            let w = this.parents[i];
            if (label === undefined) {
              while (this.types[w] !== Type.WHILE) {
                if (w === this.parents[w]) {
                  throw new Error("break outside of while");
                }
                w = this.parents[w];
              }
            } else {
              while (w !== this.parents[w] && labels[w] !== label) {
                if (w === this.parents[w]) {
                  throw new Error("labelled break outside of labelled while");
                }
                w = this.parents[w];
              }
            }
            this.types[i] = Type.GOTO;
            this.values[i] = w;
            this.targets.add(w);
          }
          return;
      }
    });
  }

  #addNode(parent: number, type: Type) {
    const index = this.types.length;
    this.parents[index] = parent;
    this.types[index] = type;
    return index;
  }

  #unrollExpressions() {
    for (let i = 0, l = this.types.length; i < l; i++) {
      if (!this.expressions.has(this.parents[i])) continue;
      this.values[this.#addNode(this.parents[i], Type.READ)] = i;
      while (this.expressions.has(this.parents[i])) {
        this.parents[i] = this.parents[this.parents[i]];
      }
    }
  }

  toString() {
    const roots: number[] = [];
    const fc = this.parents.map(() => -1);
    const ns = this.parents.map(() => -1);
    for (let i = this.parents.length - 1; i >= 0; i--) {
      if (this.parents[i] === undefined || this.deleted.has(i)) continue;
      if (this.parents[i] === i) roots.push(i);
      else {
        ns[i] = fc[this.parents[i]];
        fc[this.parents[i]] = i;
      }
    }

    const l = Math.log10(this.parents.length);
    const pad = " ".repeat(l);

    const depths: number[] = [];
    const nodes: number[] = [];
    for (let r = roots.length - 1; r >= 0; r--) {
      let d = 0;
      a: for (let i = roots[r];;) {
        if (fc[i] >= 0) {
          depths.push(d++);
          nodes.push(i);
          i = fc[i];
          continue;
        }
        depths.push(d);
        nodes.push(i);
        while (ns[i] < 0) {
          if (this.parents[i] === i) break a;
          d--;
          i = this.parents[i];
        }
        i = ns[i];
      }
    }

    return [
      this.pool.toString(),
      this.targets.toString(),
      ...depths.map((d, i) => {
        const n = nodes[i];
        const a = pad + n;
        return a.slice(a.length - l) + ":" + "  ".repeat(d) +
          Type[this.types[n]] +
          (this.values[n] !== undefined ? " " + this.values[n] : "");
      }),
    ].join("\n");
  }
}
