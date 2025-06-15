import { NatSet } from "../collections/natset.ts";
import { Frames, Op } from "./yap.ts";

function prettyPrint(parents: number[]) {
  const children: number[][] = parents.map(() => []);
  const roots: number[] = [];
  parents.forEach((x, i) => {
    if (x === i) roots.push(i);
    else if (x === undefined) return;
    else children[x].push(i);
  });
  function str(i: number): string {
    if (children[i].length === 0) return i.toString();
    return "(" + [i.toString(), ...children[i].map((it) => str(it))].join(" ") +
      ")";
  }
  return roots.map((it) => str(it)).join("\n");
}

// respresent expressions as a parent vector for the tokens
// so this is a pass that
export class Expressions {
  #parents: number[] = [];

  constructor(readonly frames: Frames) {
    const lParens = new NatSet();

    for (let i = 0, l = frames.size(); i < l; i++) {
      switch (frames.op(i)) {
        case Op.Args: {
          // Args -> ExprTail -> Expr(Tail)
          const parent = frames.token(frames.parent(i));
          const sibling = frames.token(frames.parent(frames.parent(i)));
          // if the sibling is part of an expression, integrate this one!
          this.#parents[parent] = this.#parents[sibling] === sibling
            ? parent
            : this.#parents[sibling];
          this.#parents[sibling] = parent;
          break;
        }
        case Op.Identifier: // reuse expr logic for member access
        case Op.Expr: {
          const expr = frames.token(i);
          const parentOp = frames.op(frames.parent(i));
          if (parentOp === Op.Args) {
            this.#parents[expr] = frames.token(frames.parent(frames.parent(i)));
            break;
          }
          if (parentOp === Op.ExprTail || parentOp === Op.ArgsTail) {
            // Expr -> ExprTail -> Expr(Tail)
            const parent = frames.token(frames.parent(i));
            const sibling = frames.token(frames.parent(frames.parent(i)));
            this.#parents[expr] = parent;
            // if the sibling is part of an expression, integrate this one!
            this.#parents[parent] = this.#parents[sibling] === sibling
              ? parent
              : this.#parents[sibling];
            this.#parents[sibling] = parent;
            break;
          }
          if (parentOp === Op.ExprHead) {
            const paren = frames.token(
              frames.parent(i),
            );
            // parenthetical case
            this.#parents[frames.token(i)] = paren;
            lParens.add(paren);
            break;
          }
          this.#parents[expr] = expr;
          break;
        }
        case Op.ExprHead:
          if (frames.op(frames.parent(i)) === Op.ExprHead) {
            this.#parents[frames.token(i)] = frames.token(
              frames.parent(i),
            );
          }
          break;
        default:
          break;
      }
    }

    for (let i = 0, l = this.#parents.length; i < l; i++) {
      const j = this.#parents[i];
      if (lParens.has(j)) {
        this.#parents[i] = this.#parents[j];
        delete this.#parents[j];
      }
    }
  }

  toString() {
    return prettyPrint(this.#parents);
  }
}

export class Statements {
  #parents: number[] = [];

  constructor(readonly frames: Frames) {
    for (let i = 0, l = frames.size(); i < l; i++) {
      if (frames.op(i) === Op.Stmt) {
        this.#parents[frames.token(i)] =
          this.#parents[frames.token(frames.parent(frames.parent(i)))];
      }
    }
    console.log(this.#parents)
  }

  toString() {
    return prettyPrint(this.#parents);
  }
}
