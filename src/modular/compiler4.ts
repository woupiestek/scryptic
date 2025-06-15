import { NatSet } from "../collections/natset.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Frames, Op, Parser } from "./yap.ts";

function prettyPrint(parents: number[]): string {
  // get roots, left child and right sibling vectors
  // for parent vector
  const roots: number[] = [];
  const lc = parents.map(() => -1);
  const rs = parents.map(() => -1);
  for (let i = parents.length - 1; i >= 0; i--) {
    if (parents[i] === undefined) continue;
    if (parents[i] === i) roots.push(i);
    else {
      rs[i] = lc[parents[i]];
      lc[parents[i]] = i;
    }
  }
  if (roots.length === 0) return "";

  // traverse the tree to build the string
  let res = "";
  for (let r = roots.length - 1; r >= 0; r--) {
    a: for (let i = roots[r];;) {
      while (lc[i] >= 0) {
        res += "(" + i + " ";
        i = lc[i];
      }
      res += i;
      while (rs[i] == -1) {
        if (parents[i] === i) break a;
        res += ")";
        i = parents[i];
      }
      res += " ";
      i = rs[i];
    }
    if (r > 0) res += ";";
  }
  return res;
}

// respresent expressions as a parent vector for the tokens
// so this is a pass that
export class Expressions {
  parents: number[] = [];

  constructor(readonly frames: Frames) {
    const lParens = new NatSet();

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

// small steps?
export class StaticSingleAssignment {
  #automaton = new Automaton();
  #parser = new Parser();
  #expressions;

  constructor(private source: string) {
    this.#automaton.readString(source);
    this.#parser.visitAll(this.#automaton.types);
    this.#expressions = new Expressions(this.#parser.frames);
    this.#register();
  }

  #name(token: number) {
    const from = this.#automaton.indices[token];
    let to = from;
    while (to < this.source.length && /[0-9A-Za-z]/.test(this.source[++to]));
    return this.source.slice(from, to);
  }

  identifiers: number[] = [];
  names: string[] = [];
  values: number[] = [];

  // just point to the first occurance of the variable with the same value
  // here the tokens are easy to tell apart, but it is not clear when they are the same value
  #register() {
    const rhs: Map<number, number> = new Map();
    const lhs: Map<string, number> = new Map();
    for (let i = 0, l = this.#expressions.parents.length; i < l; i++) {
      const parent = this.#expressions.parents[i];
      if (parent === undefined) continue;

      if (this.#automaton.types[i] === TokenType.IDENTIFIER) {
        this.identifiers.push(i);
        const name = this.#name(i);
        const id = this.names.push(name) - 1;

        // check for assignment
        if (this.#automaton.types[parent] === TokenType.BE && i < parent) {
          rhs.set(parent, id);
        } else if (this.#automaton.types[parent] === TokenType.VAR) {
          const grampaw = this.#expressions.parents[parent];
          if (
            this.#automaton.types[grampaw] === TokenType.BE && parent < grampaw
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

      if (this.#automaton.types[parent] === TokenType.BE && i > parent) {
        const id = rhs.get(parent);
        if (id === undefined) continue; // though something went wrong
        this.values[id] = i;
        lhs.set(this.names[id], i);
      }
    }
  }
}
