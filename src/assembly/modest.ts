import { Table } from "../collections/table.ts";
import { TokenType } from "./lex.ts";
import { Node } from "./parser2.ts";

export enum ValueT {
  Access,
  Boolean,
  Call,
  Compare,
  Declare,
  Log,
  New,
  Not,
  String,
  Variable,
  Be,
  Define,
  Error,
  Goto,
  If,
  Return,
}
export type Value =
  | [ValueT.Access, Value, number]
  | [ValueT.Be, Value, Value, Value]
  | [ValueT.Boolean, boolean]
  | [ValueT.Call, ...Value[]]
  | [ValueT.Compare, TokenType, Value, Value]
  | [ValueT.Declare, number]
  | [ValueT.Define, number, Value, Value]
  | [ValueT.Error, number, string]
  | [ValueT.Goto, number]
  | [ValueT.If, Value, Value, Value]
  | [ValueT.Log, Value]
  | [ValueT.New, number]
  | [ValueT.Not, Value]
  | [ValueT.Return, Value | undefined]
  | [ValueT.String, number]
  | [ValueT.Variable, number];

export const Value = {
  stringify(value: Value): string {
    const [h, ...t] = value;
    const u = t.map((it: unknown) => {
      if (it instanceof Array) return Value.stringify(it as Value);
      return it;
    });
    return `(${ValueT[h]} ${u.join(" ")})`;
  },
};

export class CPS<A> {
  constructor(
    readonly complete: (
      next: (a: A) => Value,
    ) => Value,
  ) {}
  bind<B>(f: (_: A) => CPS<B>): CPS<B> {
    return new CPS((next) => this.complete((a) => f(a).complete(next)));
  }
  static mu<A>(that: CPS<CPS<A>>): CPS<A> {
    return new CPS((next) => that.complete((a) => a.complete(next)));
  }
  static unit<A>(a: A): CPS<A> {
    return new CPS((next) => next(a));
  }
  map<B>(f: (_: A) => B): CPS<B> {
    return new CPS((next) => this.complete((a) => next(f(a))));
  }

  static sequence<A>(cpss: CPS<A>[]): CPS<A[]> {
    const as: A[] = [];
    let pivot: CPS<undefined> = CPS.unit(undefined);
    for (const cps of cpss) {
      pivot = pivot.bind(() =>
        cps.map((a) => {
          as.push(a);
          return undefined;
        })
      );
    }
    return pivot.map(() => as);
  }
}

// modest transformation
// just make it longer, don't know what else to do yet
export class Modest {
  #label = 0;
  #break = this.#label++;
  #continue = this.#label++;
  #next = this.#label++;
  #labels = new Table<number>();

  constructor(private types: TokenType[]) {}

  static #error<A>(node: Node, message: string): CPS<A> {
    return new CPS(
      (
        _,
      ) => [
        ValueT.Error,
        node.token,
        message,
      ],
    );
  }

  bool(node: Node): CPS<boolean> {
    switch (this.types[node.token]) {
      case TokenType.AND:
        return this.bool(node.children[0]).bind((value) =>
          value ? this.bool(node.children[1]) : CPS.unit(false)
        );
      case TokenType.BE:
        return this.expression(node.children[0]).bind((a) =>
          this.bool(node.children[1]).bind(
            (b) =>
              new CPS((
                next,
              ) => [ValueT.Be, a, [ValueT.Boolean, b], next(b)]),
          )
        );
      case TokenType.DOT:
      case TokenType.IDENTIFIER:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.LOG:
      case TokenType.PAREN_LEFT:
        // the hard case
        return this.expression(node).bind(
          (value) =>
            new CPS<boolean>(
              (next) => [ValueT.If, value, next(true), next(false)],
            ),
        );
      case TokenType.FALSE:
        return CPS.unit(false);
      case TokenType.NOT:
        return this.expression(node.children[0]).map((v) => !v);
      case TokenType.OR:
        return this.bool(node.children[0]).bind((value) =>
          value ? CPS.unit(true) : this.bool(node.children[1])
        );
      case TokenType.TRUE:
        return CPS.unit(true);
      default:
        return Modest.#error(node, "Invalid token type for boolean expression");
    }
  }
  expression(node: Node): CPS<Value> {
    switch (this.types[node.token]) {
      case TokenType.AND:
        return this.bool(node.children[0]).bind((value) =>
          value
            ? this.expression(node.children[1])
            : CPS.unit([ValueT.Boolean, false])
        );
      case TokenType.BE:
        return this.expression(node.children[0]).bind((a) =>
          this.expression(node.children[1]).bind(
            (b) => new CPS((next) => [ValueT.Be, a, b, next(b)]),
          )
        );
      case TokenType.DOT:
        return this.expression(node.children[0]).map(
          (value) => [ValueT.Access, value, node.parameter as number],
        );
      case TokenType.FALSE:
        return CPS.unit([ValueT.Boolean, false]);
      case TokenType.IDENTIFIER:
        // do the ssa here by renaming the variable?
        return CPS.unit([ValueT.Variable, node.parameter as number]);
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
        // todo: use proper compare function?
        return this.expression(node.children[0]).bind((a) =>
          this.expression(node.children[1]).map(
            (b) => [ValueT.Compare, this.types[node.token], a, b],
          )
        );
      case TokenType.LOG:
        return this.expression(node.children[0]).map((v) => [ValueT.Log, v]);
      case TokenType.NEW:
        return CPS.unit([ValueT.New, node.parameter as number]);
      case TokenType.NOT:
        // todo: negate function?
        return this.expression(node.children[0]).map((v) => [ValueT.Not, v]);
      case TokenType.OR:
        return this.bool(node.children[0]).bind((value) =>
          value
            ? CPS.unit([ValueT.Boolean, true])
            : this.expression(node.children[1])
        );
      case TokenType.PAREN_LEFT:
        return CPS.sequence(node.children.map((it) => this.expression(it))).map(
          (it) => [ValueT.Call, ...it],
        );
      case TokenType.STRING:
        return CPS.unit([ValueT.String, node.parameter as number]);
      // case TokenType.THIS:
      case TokenType.TRUE:
        return CPS.unit([ValueT.Boolean, true]);
      case TokenType.VAR:
        return CPS.unit([ValueT.Declare, node.parameter as number]);
      default:
        return Modest.#error(
          node,
          "Invalid token type for expression",
        );
    }
  }

  // not quite traverse
  statements(nodes: Node[]): CPS<number> {
    let cps = CPS.unit(this.#next);
    for (const node of nodes) {
      cps = cps.bind((goto) =>
        goto === this.#next ? this.statement(node) : CPS.unit(goto)
      );
    }
    return cps;
  }
  statement(node: Node): CPS<number> {
    switch (this.types[node.token]) {
      case TokenType.AND:
      case TokenType.BE:
      case TokenType.DOT:
      case TokenType.FALSE:
      case TokenType.IDENTIFIER:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.LOG:
      case TokenType.MORE:
      case TokenType.NEW:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.NOT:
      case TokenType.OR:
      case TokenType.PAREN_LEFT:
      case TokenType.STRING:
      case TokenType.THIS:
      case TokenType.TRUE:
      case TokenType.VAR:
        return this.expression(node).map(() => this.#next);
      case TokenType.BRACE_LEFT:
        return this.statements(node.children);
      case TokenType.BREAK: {
        let n = this.#break;
        if (node.parameter !== undefined) {
          const l = this.#labels.get(node.parameter * 2);
          if (l === undefined) return Modest.#error(node, "unresolved label");
          n = l;
        }
        return this.statements(node.children[0].children).map((goto) =>
          goto === this.#next ? n : goto
        );
      }
      case TokenType.CONTINUE: {
        let n = this.#continue;
        if (node.parameter !== undefined) {
          const l = this.#labels.get(node.parameter * 2);
          if (l === undefined) return Modest.#error(node, "unresolved label");
          n = l;
        }
        return this.statements(node.children[0].children).map((goto) =>
          goto === this.#next ? n : goto
        );
      }
      case TokenType.RETURN:
        return this.statements(node.children[0].children).bind((goto) => {
          if (goto !== this.#next) return CPS.unit(goto);
          if (node.children[1] !== undefined) {
            return this.expression(node.children[1]).bind((value) =>
              new CPS((_) => [ValueT.Return, value])
            );
          }
          return new CPS((_) => [ValueT.Return, undefined]);
        });

      case TokenType.IF:
        // todo: break up blocks?
        return this.bool(node.children[0]).bind((value) => {
          if (value) return this.statement(node.children[1]);
          if (node.children[2] !== undefined) {
            return this.statement(node.children[2]);
          }
          return CPS.unit(this.#next);
        });
      case TokenType.WHILE: {
        // mess may not be needed if labels etc. are renamed as well...
        const breakLabel = this.#label++;
        const continueLabel = this.#label++;
        if (node.parameter !== undefined) {
          this.#labels.set(node.parameter * 2, breakLabel);
          this.#labels.set(node.parameter * 2 + 1, continueLabel);
        }
        const loop: CPS<number> = this.bool(node.children[0]).bind(
          (value) => {
            if (!value) return CPS.unit(this.#next);
            return this.statement(node.children[1]).bind((goto) => {
              if (
                goto === this.#next || goto === this.#continue ||
                goto === continueLabel
              ) return new CPS(() => [ValueT.Goto, continueLabel]);
              if (goto === this.#break || goto === breakLabel) {
                return new CPS(() => [ValueT.Goto, breakLabel]);
              }
              return CPS.unit(goto);
            });
          },
        );
        return new CPS((next) => [
          ValueT.Define,
          breakLabel,
          next(this.#next),
          [
            ValueT.Define,
            continueLabel,
            // no idea
            loop.complete((goto) => [ValueT.Goto, goto]),
            [ValueT.Goto, continueLabel],
          ],
        ]);
      }
      default:
        return Modest.#error(
          node,
          "Invalid token type for statement",
        );
    }
  }
}
