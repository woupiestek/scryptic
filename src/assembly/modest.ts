import { Table } from "../collections/table.ts";
import { TokenType } from "./lex.ts";
import { Parse } from "./parse2.ts";

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

class Strings {
  #back: { [_: string]: number } = {};
  #forth: string[] = [];
  store(string: string): number {
    if (this.#back[string] === undefined) {
      this.#back[string] = this.#forth.push(string) - 1;
    }
    return this.#back[string];
  }
  fetch(id: number) {
    return this.#forth[id];
  }
}

export class Modest {
  #label = 0;
  #break = this.#label++;
  #continue = this.#label++;
  #next = this.#label++;
  #labels = new Table<number>();
  #strings = new Strings();

  constructor(private parse: Parse) {}

  #error<A>(node: number, message: string): CPS<A> {
    return new CPS(
      (
        _,
      ) => [
        ValueT.Error,
        this.parse.tokens[node],
        message,
      ],
    );
  }

  #tokenType(node: number) {
    return this.parse.lex.types[this.parse.tokens[node]];
  }

  bool(node: number): CPS<boolean> {
    const children = this.parse.children(node);
    switch (this.#tokenType(node)) {
      case TokenType.AND:
        return this.bool(node - 1).bind((value) =>
          value ? this.bool(children[1]) : CPS.unit(false)
        );
      case TokenType.BE:
        return this.expression(node - 1).bind((a) =>
          this.bool(children[1]).bind(
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
        return this.expression(node - 1).map((v) => !v);
      case TokenType.OR:
        return this.bool(node - 1).bind((value) =>
          value ? CPS.unit(true) : this.bool(children[1])
        );
      case TokenType.TRUE:
        return CPS.unit(true);
      default:
        return this.#error(node, "Invalid token type for boolean expression");
    }
  }
  #lexeme(node: number) {
    return this.parse.lex.lexeme(this.parse.tokens[node]);
  }
  expression(node: number): CPS<Value> {
    const children = this.parse.children(node);
    switch (this.#tokenType(node)) {
      case TokenType.AND:
        return this.bool(node - 1).bind((value) =>
          value
            ? this.expression(children[1])
            : CPS.unit([ValueT.Boolean, false])
        );
      case TokenType.BE:
        return this.expression(node - 1).bind((a) =>
          this.expression(children[1]).bind(
            (b) => new CPS((next) => [ValueT.Be, a, b, next(b)]),
          )
        );
      case TokenType.DOT:
        return this.expression(node - 1).map(
          (
            value,
          ) => [ValueT.Access, value, this.#strings.store(this.#lexeme(node))],
        );
      case TokenType.FALSE:
        return CPS.unit([ValueT.Boolean, false]);
      case TokenType.IDENTIFIER:
        // do the ssa here by renaming the variable?
        return CPS.unit([
          ValueT.Variable,
          this.#strings.store(this.#lexeme(node)),
        ]);
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
        // todo: use proper compare function?
        return this.expression(node - 1).bind((a) =>
          this.expression(children[1]).map(
            (b) => [ValueT.Compare, this.#tokenType(node), a, b],
          )
        );
      case TokenType.LOG:
        return this.expression(node - 1).map((v) => [ValueT.Log, v]);
      case TokenType.NEW:
        return CPS.unit([ValueT.New, this.#strings.store(this.#lexeme(node))]);
      case TokenType.NOT:
        // todo: negate function?
        return this.expression(node - 1).map((v) => [ValueT.Not, v]);
      case TokenType.OR:
        return this.bool(node - 1).bind((value) =>
          value
            ? CPS.unit([ValueT.Boolean, true])
            : this.expression(children[1])
        );
      case TokenType.PAREN_LEFT:
        return CPS.sequence(children.map((it) => this.expression(it))).map(
          (it) => [ValueT.Call, ...it],
        );
      case TokenType.STRING:
        return CPS.unit([
          ValueT.String,
          this.#strings.store(this.#lexeme(node)),
        ]);
      // case TokenType.THIS:
      case TokenType.TRUE:
        return CPS.unit([ValueT.Boolean, true]);
      case TokenType.VAR:
        return CPS.unit([
          ValueT.Declare,
          this.#strings.store(this.#lexeme(node)),
        ]);
      default:
        return this.#error(
          node,
          "Invalid token type for expression",
        );
    }
  }

  // not quite traverse
  statements(nodes: number[]): CPS<number> {
    let cps = CPS.unit(this.#next);
    for (const node of nodes) {
      cps = cps.bind((goto) =>
        goto === this.#next ? this.statement(node) : CPS.unit(goto)
      );
    }
    return cps;
  }
  statement(node: number): CPS<number> {
    const children = this.parse.children(node);
    switch (this.#tokenType(node)) {
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
        return this.statements(children);
      case TokenType.BREAK: {
        let n = this.#break;
        if (children.length) {
          const l = this.#labels.get(
            this.#strings.store(this.#lexeme(node - 1)) * 2,
          );
          if (l === undefined) return this.#error(node, "unresolved label");
          n = l;
        }
        return this.statements(this.parse.children(node - 1)).map((goto) =>
          goto === this.#next ? n : goto
        );
      }
      case TokenType.CONTINUE: {
        let n = this.#continue;
        if (children.length) {
          const l = this.#labels.get(
            this.#strings.store(this.#lexeme(node - 1)) * 2,
          );
          if (l === undefined) return this.#error(node, "unresolved label");
          n = l;
        }
        return this.statements(this.parse.children(node - 1)).map((goto) =>
          goto === this.#next ? n : goto
        );
      }
      case TokenType.RETURN:
        return this.statements(this.parse.children(node - 1)).bind(
          (goto) => {
            if (goto !== this.#next) return CPS.unit(goto);
            if (children[1] !== undefined) {
              return this.expression(children[1]).bind((value) =>
                new CPS((_) => [ValueT.Return, value])
              );
            }
            return new CPS((_) => [ValueT.Return, undefined]);
          },
        );

      case TokenType.IF:
        // todo: break up blocks?
        return this.bool(node - 1).bind((value) => {
          if (value) return this.statement(children[1]);
          if (children[2] !== undefined) {
            return this.statement(children[2]);
          }
          return CPS.unit(this.#next);
        });
      case TokenType.WHILE: {
        // mess may not be needed if labels etc. are renamed as well...
        const breakLabel = this.#label++;
        const continueLabel = this.#label++;
        if (children.length > 2) {
          const parameter = this.#strings.store(
            this.#lexeme(children.shift() ?? -1),
          );
          this.#labels.set(parameter * 2, breakLabel);
          this.#labels.set(parameter * 2 + 1, continueLabel);
        }
        const loop: CPS<number> = this.bool(node - 1).bind(
          (value) => {
            if (!value) return CPS.unit(this.#next);
            return this.statement(children[1]).bind((goto) => {
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
        return this.#error(
          node,
          "Invalid token type for statement",
        );
    }
  }
}
