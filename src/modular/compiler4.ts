import { UIntSet } from "../collections/uintset.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Frames, Op, Parser } from "./yap.ts";

export function prettyPrint(parents: number[]): string {
  // get roots, left child and right sibling vectors
  // for parent vector
  const roots: number[] = [];
  const fc = parents.map(() => -1);
  const ns = parents.map(() => -1);
  for (let i = parents.length - 1; i >= 0; i--) {
    if (parents[i] === undefined) continue;
    if (parents[i] === i) roots.push(i);
    else {
      ns[i] = fc[parents[i]];
      fc[parents[i]] = i;
    }
  }
  if (roots.length === 0) return "";

  // traverse the tree to build the string
  let result = "";
  for (let r = roots.length - 1; r >= 0; r--) {
    a: for (let i = roots[r];;) {
      if (fc[i] >= 0) {
        result += "(" + i + " ";
        i = fc[i];
        continue;
      }
      result += i;
      while (ns[i] < 0) {
        if (parents[i] === i) break a;
        result += ")";
        i = parents[i];
      }
      result += " ";
      i = ns[i];
    }
    if (r > 0) result += ";";
  }
  return result;
}

// respresent expressions as a parent vector for the tokens
// so this is a pass that
export class Expressions {
  parents: number[] = [];

  constructor(readonly frames: Frames) {
    const lParens = new UIntSet();

    for (let i = 0, l = frames.size(); i < l; i++) {
      switch (frames.op(i)) {
        case Op.Args: {
          // Args -> ExprTail -> Expr(Tail)
          const parent = frames.token(frames.parent(i));
          const sibling = frames.token(frames.parent(frames.parent(i)));
          // if the sibling is part of an expression, integrate this one!
          this.parents[parent] = this.parents[sibling] === sibling
            ? parent
            : this.parents[sibling];
          this.parents[sibling] = parent;
          break;
        }
        case Op.Identifier: // reuse expr logic for member access
        {
          const iden = frames.token(i);
          const parentOp = frames.op(frames.parent(i));
          if (parentOp === Op.ExprTail) {
            // Expr -> ExprTail -> Expr(Tail)
            const parent = frames.token(frames.parent(i));
            const sibling = frames.token(frames.parent(frames.parent(i)));
            this.parents[iden] = parent;
            // if the sibling is part of an expression, integrate this one!
            this.parents[parent] = this.parents[sibling] === sibling
              ? parent
              : this.parents[sibling];
            this.parents[sibling] = parent;
            break;
          }
          if (parentOp === Op.ExprHead) {
            this.parents[frames.token(i)] = frames.token(
              frames.parent(i),
            );
          }
          break;
        }
        case Op.Expr: {
          const expr = frames.token(i);
          const parentOp = frames.op(frames.parent(i));
          if (parentOp === Op.Args) {
            this.parents[expr] = frames.token(frames.parent(frames.parent(i)));
            break;
          }
          if (parentOp === Op.ExprTail || parentOp === Op.ArgsTail) {
            // Expr -> ExprTail -> Expr(Tail)
            const parent = frames.token(frames.parent(i));
            const sibling = frames.token(frames.parent(frames.parent(i)));
            this.parents[expr] = parent;
            // if the sibling is part of an expression, integrate this one!
            this.parents[parent] = this.parents[sibling] === sibling
              ? parent
              : this.parents[sibling];
            this.parents[sibling] = parent;
            break;
          }
          if (parentOp === Op.ExprHead) {
            const paren = frames.token(
              frames.parent(i),
            );
            // parenthetical case
            this.parents[frames.token(i)] = paren;
            lParens.add(paren);
            break;
          }
          this.parents[expr] = expr;
          break;
        }
        case Op.ExprHead:
          if (frames.op(frames.parent(i)) === Op.ExprHead) {
            this.parents[frames.token(i)] = frames.token(
              frames.parent(i),
            );
          }
          break;
        default:
          break;
      }
    }

    for (let i = 0, l = this.parents.length; i < l; i++) {
      const j = this.parents[i];
      if (lParens.has(j)) {
        this.parents[i] = this.parents[j];
        delete this.parents[j];
      }
    }
  }

  toString() {
    return prettyPrint(this.parents);
  }
}

export class Statements {
  #parents: number[] = [];

  constructor(readonly frames: Frames) {
    for (let i = 0, l = frames.size(); i < l; i++) {
      const grampaw = frames.parent(frames.parent(i));
      if (frames.op(i) === Op.Stmt) {
        this.#parents[frames.token(i)] = frames.token(grampaw);
        continue;
      }
      if (
        frames.op(i) === Op.Block || frames.op(i) === Op.Else ||
        frames.op(i) === Op.BlockEnd || frames.op(i) === Op.Label
      ) {
        this.#parents[frames.token(i)] = frames.token(frames.parent(i));
      }
    }
  }

  toString() {
    return prettyPrint(this.#parents);
  }
}

export class Data {
  // tokens
  types: TokenType[];
  indices: number[];
  // frames
  ops: Op[];
  tokens: number[];
  parents: number[];
  expressions;

  constructor(readonly source: string) {
    const automaton = new Automaton();
    automaton.readString(source);
    this.types = automaton.types;
    this.indices = automaton.indices;
    const parser = new Parser();
    parser.visitAll(this.types);
    this.ops = parser.frames.ops;
    this.tokens = parser.frames.tokens;
    this.parents = parser.frames.parents;
    this.expressions = new Expressions(parser.frames);
  }

  type(id: number) {
    return this.types[this.tokens[id]];
  }

  name(id: number) {
    return name(
      this.source,
      this.indices[this.tokens[id]],
    );
  }
}

function name(source: string, from: number) {
  let to = from;
  while (
    to < source.length &&
    /[0-9A-Za-z]/.test(source[++to])
  );
  return source.slice(from, to);
}

// small steps?
export class StaticSingleAssignment {
  #data;
  constructor(source: string) {
    this.#data = new Data(source);
    this.#register();
  }

  #name(token: number) {
    return name(this.#data.source, this.#data.indices[token]);
  }

  identifiers: number[] = [];
  names: string[] = [];
  values: number[] = [];

  // just point to the first occurance of the variable with the same value
  // here the tokens are easy to tell apart, but it is not clear when they are the same value
  #register() {
    const rhs: Map<number, number> = new Map();
    const lhs: Map<string, number> = new Map();
    for (let i = 0, l = this.#data.expressions.parents.length; i < l; i++) {
      const parent = this.#data.expressions.parents[i];
      if (parent === undefined) continue;

      if (this.#data.types[i] === TokenType.IDENTIFIER) {
        this.identifiers.push(i);
        const name = this.#name(i);
        const id = this.names.push(name) - 1;

        // check for assignment
        if (this.#data.types[parent] === TokenType.BE && i < parent) {
          rhs.set(parent, id);
        } else if (this.#data.types[parent] === TokenType.VAR) {
          const grampaw = this.#data.expressions.parents[parent];
          if (
            this.#data.types[grampaw] === TokenType.BE &&
            parent < grampaw
          ) {
            rhs.set(grampaw, id);
          }
        } else {
          const value = lhs.get(name);
          if (value === undefined) {
            lhs.set(name, i);
            this.values[id] = i;
          } else {
            this.values[id] = value;
          }
        }
      }

      if (this.#data.types[parent] === TokenType.BE && i > parent) {
        const id = rhs.get(parent);
        if (id === undefined) continue; // though something went wrong
        this.values[id] = i;
        lhs.set(this.names[id], i);
      }
    }
  }
}

export class BasicBlocks {
  constructor(private data: Data) {
    this.#traverse();
  }

  #empty(id: number) {
    switch (this.data.types[this.data.tokens[id]]) {
      case TokenType.BRACE_RIGHT:
      case TokenType.BREAK:
      case TokenType.CONTINUE:
      case TokenType.END:
      case TokenType.RETURN:
        return true;
      default:
        return false;
    }
  }

  //#labels: Map<number, number> = new Map();
  readonly next: Map<number, number> = new Map();

  #traverse() {
    const stmts: number[] = [];
    this.data.ops.forEach((op, i) => {
      if (op === Op.Stmts) stmts.push(i);
    });

    const set = new Set(
      stmts.map((stmt) => this.data.indices[this.data.tokens[stmt]]),
    );
    console.log(set);
    const str = Array(this.data.source.length).keys().map((i) =>
      set.has(i) ? "*" : " "
    ).toArray().join("");
    console.log(this.data.source);
    console.log(str);

    stmts.forEach((stmt) => this.next.set(this.data.parents[stmt], stmt));
  }
}
