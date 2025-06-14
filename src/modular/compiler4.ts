import { Automaton, TokenType } from "./lexer.ts";
import { Op, Parser } from "./yap.ts";

export class Compiler {
  #automaton = new Automaton();
  #parser = new Parser();
  #exprs = new Expressions();

  constructor(
    private readonly source: string,
  ) {
    this.#automaton.readString(source);
    this.#parser.visitAll(this.#automaton.types);
    console.log(this.#parser.frames.toString());
    this.#expressions();
    console.log(this.#exprs.toString());
  }

  #type(id: number) {
    return this.#automaton.types[this.#parser.frames.token(id)];
  }

  #index(id: number) {
    return this.#automaton.indices[this.#parser.frames.token(id)];
  }

  #expressions() {
    const parents = this.#parser.frames.parents();
    const exprs: number[] = [];
    for (let i = 0, l = parents.length; i < l; i++) {
      switch (this.#parser.frames.op(i)) {
        // case Op.Expr:
        case Op.ExprHead: {
          const x = (exprs[i] ??= this.#exprs.new());
          const y = (exprs[parents[i]] ??= this.#exprs.new());
          this.#exprs.set(x, this.#type(i), 0, y);
          break;
        }
        case Op.ExprTail: {
          if (this.#parser.frames.isLeaf(i)) continue;
          const pi = parents[i];
          const ppi = parents[pi];
          const y = (exprs[pi] ??= this.#exprs.new());
          const z = (this.#parser.frames.op(ppi) === Op.ExprTail)
            ? (exprs[ppi] ??= this.#exprs.new())
            : y;
          this.#exprs.set(y, this.#type(i), 1, z);
          break;
          //
        }
        case Op.Args:
        case Op.ArgsTail:
        case Op.Identifier:
      }
    }
  }
}

class Expressions {
  #parents: number[] = [];
  #types: TokenType[] = [];
  #child: number[] = [];

  #index = 0;

  new() {
    return this.#index++;
  }

  set(index: number, type: TokenType, child: number, parent?: number) {
    this.#types[index] = type;
    this.#child[index] = child;
    this.#parents[index] = parent ?? index;
  }

  toString() {
    return [
      this.#types.map((t) => TokenType[t]).join(),
      this.#parents.keys().toArray().join(),
      this.#parents.join(),
      this.#child.join(),
    ].join("\n");
  }
}
