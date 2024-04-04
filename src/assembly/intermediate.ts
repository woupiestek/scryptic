import { NumberTrie } from "../numberTrie2.ts";
import { Map } from "../table.ts";
import { Token, TokenType } from "./lexer.ts";
import {
  Access,
  Binary,
  Block,
  Break,
  Call,
  Continue,
  Expression,
  IfStatement,
  Jump,
  Literal,
  Log,
  New,
  Not,
  Return,
  Statement,
  VarDeclaration,
  Variable,
  WhileStatement,
} from "./parser.ts";

function tupleString(...strings: unknown[]): string {
  return `(${strings.join(" ")})`;
}

enum ValueType {
  Call,
  Comparison,
  Declared,
  GetField,
  Literal,
  Log,
  New,
  Not,
  Phi,
  SetField,
}

type ValueQ = Value | undefined;

type Data =
  | [ValueType.GetField, ValueQ, ValueQ, string]
  | [ValueType.Call, ValueQ, ValueQ, ...ValueQ[]]
  | [ValueType.Comparison, ValueQ, TokenType, ValueQ]
  | [ValueType.Declared]
  | [ValueType.Literal, boolean | string]
  | [ValueType.Log, ValueQ, ValueQ]
  | [ValueType.New, string]
  | [ValueType.Not, Value]
  | [ValueType.Phi, number]
  | [ValueType.SetField, ValueQ, ValueQ, string, ValueQ];

export class Value {
  constructor(
    readonly key: number,
    readonly token: Token,
    readonly data: Data,
  ) {
    if (typeof key !== "number" || key < 0 || (key | 0) !== key) {
      throw new Error("index " + key + " out of range");
    }
  }
  toString(): string {
    if (this.data === undefined) return "undefined";
    return tupleString(...this.data.map((it, i) => {
      switch (typeof it) {
        case "string":
          return JSON.stringify(it);
        case "number":
          if (i === 0) return ValueType[it];
          if (this.data[0] === ValueType.Comparison) return TokenType[it];
          return it;
        case "boolean":
        case "undefined":
          return "" + it;
        case "object":
          // since values can reference themselves...
          return (it as Value).key;
        default:
          throw new Error("Problem node " + it);
      }
    }));
  }
}
class Trie<A> {
  value?: A;
  children: Map<Trie<A>> = new Map();
}
function at<A>(
  trie: Trie<A>,
  depth: number,
  indices: (_: number) => number,
): Trie<A> {
  for (let i = 0; i < depth; i++) {
    const index = indices(i);
    const child = trie.children.get(index);
    if (child) {
      trie = child;
      continue;
    }
    const t = new Trie<A>();
    trie.children.set(index, t);
    trie = t;
  }
  return trie;
}
class Store {
  strings: Trie<number> = new Trie();
  values: Trie<Value> = new Trie();
  __key = 3;
  __index(
    key: string | number | boolean | Value | undefined,
  ): number {
    switch (typeof key) {
      case "string":
        return this.string(key);
      case "number":
        return key;
      case "boolean":
        return key ? 2 : 1;
      case "object":
        return (key as Value).key;
      case "undefined":
        return 0;
      default:
        throw new Error("Problem node " + key);
    }
  }
  literal(token: Token, data: boolean | string): Value {
    return this.value(token, [ValueType.Literal, data]);
  }
  #stringKey = 0;
  string(data: string): number {
    return (at(this.strings, data.length, (i) => data.charCodeAt(i))).value ||=
      this.#stringKey++;
  }
  value(token: Token, data: Data): Value {
    return (at(this.values, data.length, (i) => this.__index(data[i])))
      .value ||= new Value(this.__key++, token, data);
  }
  list() {
    let list = NumberTrie.empty();
    const tries = [];
    let _ = 0;
    let trie = this.values;
    for (;;) {
      if (trie.value) {
        list = list.set(trie.value.key, trie.value.toString());
      }
      tries.push(...trie.children.entries());
      if (tries.length === 0) return list.toString();
      [_, trie] = tries.pop() as [number, Trie<Value>];
    }
  }
}

export enum LabelType {
  DEFINE,
  ERROR,
  GOTO,
  IF,
  RETURN,
}

export type Label =
  | [LabelType.DEFINE, string, Label, Label]
  | [LabelType.GOTO, string, NumberTrie<Value>]
  | [LabelType.IF, Value, Label, Label]
  | [LabelType.RETURN, ValueQ, ValueQ]
  | [LabelType.ERROR, Token, string]; // error

export const Label = {
  stringify(label: Label): string {
    switch (label[0]) {
      case LabelType.DEFINE:
        return `def ${label[1]} {${Label.stringify(label[2])}} ${
          Label.stringify(label[3])
        }`;
      case LabelType.ERROR:
        return `¡Error at ${TokenType[label[1].type]}(${label[1].line},${
          label[1].column
        }): ${label[2]}!`;
      case LabelType.GOTO:
        return `${label[1]}(${
          [...label[2].entries()].map(([k, v]) => `${k}: ${v.key}`).join(", ")
        })`;
      case LabelType.IF:
        return `if ${label[1].key} then ${Label.stringify(label[2])} else ${
          Label.stringify(label[3])
        }`;
      case LabelType.RETURN:
        return `return ${label[1]?.key || -1} ${label[2]?.key || -1};`;
    }
  },
};

export class CPS<A> {
  constructor(
    readonly complete: (
      values: NumberTrie<Value>,
      next: (vs: NumberTrie<Value>, a: A) => Label,
    ) => Label,
  ) {}
  bind<B>(f: (_: A) => CPS<B>): CPS<B> {
    return new CPS((values, next) =>
      this.complete(values, (vs, a) => f(a).complete(vs, next))
    );
  }
  static mu<A>(that: CPS<CPS<A>>): CPS<A> {
    return new CPS((vs, next) =>
      that.complete(vs, (ws, a) => a.complete(ws, next))
    );
  }
  static unit<A>(a: A): CPS<A> {
    return new CPS((vs, next) => next(vs, a));
  }
  map<B>(f: (_: A) => B): CPS<B> {
    return new CPS((values, next) =>
      this.complete(values, (ws, a) => next(ws, f(a)))
    );
  }
  static get(index: number): CPS<Value | undefined> {
    return new CPS((values, next) => next(values, values.get(index)));
  }
  static set(index: number, value: Value): CPS<Value> {
    return new CPS((values, next) => next(values.set(index, value), value));
  }
  static delete(index: number): CPS<void> {
    return new CPS((values, next) => next(values.delete(index)));
  }
}

export class Optimizer {
  store = new Store();
  __break = this.store.string("<break>");
  __continue = this.store.string("<continue>");
  __next = this.store.string("<next>");
  __world = this.store.string("<world>");

  static #error<A>(token: Token, message: string): CPS<A> {
    return new CPS(() => [LabelType.ERROR, token, message]);
  }

  updateWorld(f: (_?: Value) => Value): CPS<Value> {
    return CPS.get(this.__world).bind((w) => CPS.set(this.__world, f(w)));
  }

  assign(
    node: Binary,
  ): CPS<Value> {
    switch (node.left.token.type) {
      case TokenType.DOT: {
        const { object, field } = node.left as Access;
        return this.expression(object).bind(
          (x) => {
            return this.expression(
              node.right,
            ).bind(
              (y) =>
                this.updateWorld((w) =>
                  this.store.value(node.token, [
                    ValueType.SetField,
                    w,
                    x,
                    field,
                    y,
                  ])
                ).map((_) => y),
            );
          },
        );
      }
      case TokenType.IDENTIFIER: {
        const { name } = node.left as Variable;
        const index = this.store.string(name);
        return CPS.get(index).bind((v) => {
          // still no good
          if (!v) {
            return Optimizer.#error(
              node.left.token,
              "Assigning undeclared variable " + name,
            );
          }
          return this.expression(node.right).bind((it) => CPS.set(index, it));
        });
      }
      case TokenType.VAR: {
        const varDecl = node.left as VarDeclaration;
        const { token, name } = varDecl.key;
        const index = this.store.string(name);
        return CPS.get(index).bind((other) => {
          if (other !== undefined) {
            return Optimizer.#error(
              token,
              `Variable ${name} already declared at (${other.token.line},${other.token.column})`,
            );
          }
          return this.expression(node.right).bind((it) => CPS.set(index, it));
        });
      }
      default:
        return Optimizer.#error(node.token, "Impossible assignment");
    }
  }

  negate(token: Token, value?: Value): Value {
    if (value === undefined) throw Optimizer.#error(token, `Cannot negate`);
    switch (value.data[0]) {
      case ValueType.Call:
      case ValueType.GetField:
      case ValueType.Phi:
        return this.store.value(token, [ValueType.Not, value]);
      case ValueType.Comparison: {
        let type: TokenType;
        switch (value.data[2]) {
          case TokenType.IS_NOT:
            type = TokenType.IS;
            break;
          case TokenType.IS:
            type = TokenType.IS_NOT;
            break;
          case TokenType.LESS:
            type = TokenType.NOT_LESS;
            break;
          case TokenType.MORE:
            type = TokenType.NOT_MORE;
            break;
          case TokenType.NOT_LESS:
            type = TokenType.LESS;
            break;
          case TokenType.NOT_MORE:
            type = TokenType.MORE;
            break;
          default:
            throw Optimizer.#error(token, "bad comparison");
        }
        return this.compare(token, value.data[1], type, value.data[3]);
      }
      case ValueType.Literal:
        if (typeof value.data[1] === "string") {
          throw Optimizer.#error(token, "cannot negate string");
        }
        return this.store.literal(token, !value.data[1]);
      case ValueType.Not:
        return value.data[1];
      default:
        throw Optimizer.#error(token, "Cannot negate " + value.toString());
    }
  }

  bool(
    token: Token,
    value: boolean,
  ): CPS<Value> {
    return CPS.unit(
      this.store.literal(token, value),
    );
  }

  expression(
    node: Expression,
  ): CPS<Value> {
    switch (node.token.type) {
      case TokenType.AND: {
        const { left, right } = node as Binary;
        return this.__bool(left).bind((l) =>
          l ? this.expression(right) : this.bool(left.token, false)
        );
      }
      case TokenType.BE:
        return this.assign(node as Binary);
      case TokenType.DOT: {
        const { object, field } = node as Access;
        return this.expression(object).bind((value) =>
          CPS.get(this.__world).map((w) =>
            this.store.value(
              node.token,
              [
                ValueType.GetField,
                w,
                value,
                field,
              ],
            )
          )
        );
      }
      case TokenType.FALSE:
      case TokenType.STRING:
      case TokenType.TRUE: {
        const { value } = node as Literal;
        return CPS.unit(this.store.literal(node.token, value));
      }
      case TokenType.IDENTIFIER: {
        const { name } = node as Variable;
        const index = this.store.string(name);
        return CPS.get(index).bind((value) => {
          if (value === undefined) {
            return Optimizer.#error(
              node.token,
              "Reading undeclared variable " + name,
            );
          }
          if (value.data[0] === ValueType.Declared) {
            return Optimizer.#error(
              node.token,
              "Reading unassigned variable " + name,
            );
          }
          return CPS.unit(value);
        });
      }
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE: {
        const { token, left, right } = node as Binary;
        return this.expression(left).bind((l) =>
          this.expression(right).map((r) =>
            this.compare(token, l, node.token.type, r)
          )
        );
      }
      case TokenType.LOG: {
        const { token, value } = node as Log;
        return this.expression(value).bind((v) =>
          this.updateWorld((w) =>
            this.store.value(token, [ValueType.Log, w, v])
          ).map((_) => v)
        );
      }
      case TokenType.NEW: {
        const { token, klaz } = node as New;
        return CPS.unit(this.store.value(token, [ValueType.New, klaz]));
      }
      case TokenType.NOT: {
        const { expression } = node as Not;
        return this.expression(expression).map((v) =>
          this.negate(expression.token, v)
        );
      }
      // case TokenType.THIS:
      case TokenType.OR: {
        const { left, right } = node as Binary;
        return this.__bool(left).bind((l) =>
          l ? this.bool(left.token, true) : this.expression(right)
        );
      }
      case TokenType.PAREN_LEFT: {
        const { token, operator, operands } = node as Call;
        return this.expression(operator).bind((f) => {
          if (operands.length === 0) {
            return this.updateWorld((w) =>
              this.store.value(token, [ValueType.Call, w, f])
            );
          }
          const x: ValueQ[] = [];
          let a = this.expression(operands[0]).map((v) => {
            x[0] = v;
          });
          for (let i = 1; i < operands.length; i++) {
            a = a.bind((_) =>
              this.expression(operands[i]).map((v) => {
                x[i] = v;
              })
            );
          }
          return a.bind((_) =>
            this.updateWorld((w) =>
              this.store.value(token, [ValueType.Call, w, f, ...x])
            )
          );
        });
      }
      case TokenType.VAR: {
        const varDecl = node as VarDeclaration;
        const { name } = varDecl.key;
        const index = this.store.string(name);
        return CPS.get(index).bind((value) => {
          if (value) {
            return Optimizer.#error(
              varDecl.token,
              `Variable ${name} already existed at (${value.token.line},${value.token.column})`,
            );
          }
          return CPS.set(
            index,
            this.store.value(varDecl.token, [ValueType.Declared]),
          );
        });
      }
      default:
        return Optimizer.#error(node.token, "expression expected");
    }
  }

  compare(
    token: Token,
    left: Value | undefined,
    comparison: TokenType,
    right: Value | undefined,
  ): Value {
    if (!left || !right) {
      throw Optimizer.#error(token, "bad comparison");
    }
    switch (left.data[0]) {
      case ValueType.Call:
      case ValueType.GetField:
      case ValueType.Phi:
        return this.store.value(token, [
          ValueType.Comparison,
          left,
          comparison,
          right,
        ]);
      case ValueType.Literal:
        switch (right.data[0]) {
          case ValueType.Call:
          case ValueType.GetField:
          case ValueType.Phi:
            return this.store.value(token, [
              ValueType.Comparison,
              left,
              comparison,
              right,
            ]);
          case ValueType.Literal: {
            let literal: boolean;
            switch (comparison) {
              case TokenType.IS_NOT:
                literal = left.data[1] !== right.data[1];
                break;
              case TokenType.IS:
                literal = left.data[1] === right.data[1];
                break;
              case TokenType.LESS:
                literal = left.data[1] < right.data[1];
                break;
              case TokenType.MORE:
                literal = left.data[1] > right.data[1];
                break;
              case TokenType.NOT_LESS:
                literal = left.data[1] >= right.data[1];
                break;
              case TokenType.NOT_MORE:
                literal = left.data[1] <= right.data[1];
                break;
              default:
                throw Optimizer.#error(token, "bad comparison");
            }
            return this.store.literal(token, literal);
          }
          default:
            break;
        }
        throw Optimizer.#error(token, "bad comparison right hand side");
      default:
        break;
    }
    throw Optimizer.#error(token, "bad comparison left hand side");
  }

  _jump(
    token: Token,
    jump: Jump | undefined,
  ): CPS<number> {
    if (!jump) {
      return CPS.unit(this.__next);
    }
    switch (jump.token.type) {
      case TokenType.BREAK: {
        const { label } = jump as Break;
        return CPS.unit(
          this.store.string(label ? `<break ${label}>` : "<break>"),
        );
      }
      case TokenType.CONTINUE: {
        const { label } = jump as Continue;
        return CPS.unit(this.store.string(
          label ? `<continue ${label}>` : "<continue>",
        ));
      }
      case TokenType.RETURN: {
        const { expression } = jump as Return;
        if (expression) {
          return this.expression(expression).bind((v) =>
            CPS.get(this.__world).bind((w) =>
              new CPS(() => [LabelType.RETURN, w, v])
            )
          );
        }
        return CPS.get(this.__world).bind((w) =>
          new CPS(() => [LabelType.RETURN, w, undefined])
        );
      }
    }
    return Optimizer.#error(token, "nowhere to go from here");
  }

  statements(
    statements: Statement[],
  ): CPS<number> {
    if (statements.length === 0) {
      return CPS.unit(this.__next);
    }
    let y = this.statement(statements[0]);
    for (let i = 1; i < statements.length; i++) {
      y = y.bind((goto) => {
        if (goto === this.__next) {
          return this.statement(statements[i]);
        }
        return CPS.unit(goto);
      });
    }
    return y;
  }

  block(
    block: Block,
  ): CPS<number> {
    // extra steps needed to reset the scope...
    return new CPS<Set<number>>((values, next) =>
      next(values, new Set([...values.entries()].map(([k, _]) => k)))
    ).bind((scope) =>
      (this.statements(block.statements).bind((goto) => {
        if (goto === this.__next) {
          return this._jump(block.token, block.jump);
        }
        return CPS.unit(goto);
      })).bind((goto) =>
        new CPS((values, next) => {
          let vs = values;
          for (const [k, _] of values.entries()) {
            if (scope.has(k) || this.__world === k) continue;
            vs = vs.delete(k);
          }
          return next(vs, goto);
        })
      )
    );
  }

  // fully evaluate condition,
  // then do this
  __bool(
    condition: Expression,
  ): CPS<boolean> {
    switch (condition.token.type) {
      case TokenType.AND: {
        const { left, right } = condition as Binary;
        return this.__bool(left).bind((l) =>
          l ? this.__bool(right) : CPS.unit(false)
        );
      }
      case TokenType.BE: {
        const { token, left, right } = condition as Binary;
        return this.__bool(right).bind((r) =>
          this.assign(
            new Binary(token, left, new Literal(token, r)),
          ).map((_) => r)
        );
      }
      case TokenType.FALSE:
        return CPS.unit(false);
      case TokenType.LOG: {
        const { token, value } = condition as Log;
        return this.__bool(value).bind((v) =>
          this.expression(
            new Log(token, new Literal(token, v)),
          ).map((_) => v)
        );
      }
      case TokenType.NOT: {
        const { expression } = condition as Not;
        return this.__bool(expression).map((on) => !on);
      }
      case TokenType.OR: {
        const { left, right } = condition as Binary;
        return this.__bool(left).bind((l) =>
          l ? CPS.unit(true) : this.__bool(right)
        );
      }
      case TokenType.TRUE:
        return CPS.unit(true);
      default:
        return this.expression(condition).bind(
          (c) => {
            if (!c) {
              return Optimizer.#error(
                condition.token,
                "condition without value",
              );
            }
            if (c.data[0] === ValueType.Literal) {
              const on = c.data[1];
              if (typeof on === "boolean") {
                return CPS.unit(on);
              }
              throw Optimizer.#error(
                condition.token,
                "condition not boolean",
              );
            }
            return new CPS((values, next) => [
              LabelType.IF,
              c,
              next(values, true),
              next(values, false),
            ]);
          },
        );
    }
  }

  #phonies(values: NumberTrie<Value>) {
    let phonies = NumberTrie.empty<Value>();
    for (const [k, v] of values.entries()) {
      if (v.data[0] === ValueType.Declared) {
        phonies = phonies.set(k, v);
      } else {
        phonies = phonies.set(k, this.store.value(v.token, [ValueType.Phi, k]));
      }
    }
    return phonies;
  }

  #goto<A>(label: string): CPS<A> {
    return new CPS((values, _) => [LabelType.GOTO, label, values]);
  }

  statement(
    node: Statement,
  ): CPS<number> {
    // jump target
    switch (node.token.type) {
      case TokenType.BRACE_LEFT: {
        return this.block(node as Block);
      }
      case TokenType.IF: {
        const _next = ["IF", node.token.line, node.token.column].join("_");
        const { condition, onTrue, onFalse } = node as IfStatement;
        const body: CPS<number> = this.__bool(condition).bind((it) => {
          if (it) return this.block(onTrue);
          if (onFalse) return this.block(onFalse);
          return CPS.unit(this.__next);
        }).bind((goto) => {
          if (goto === this.__next) return this.#goto(_next);
          return CPS.unit(goto);
        });
        return new CPS((values, next) => {
          return [
            LabelType.DEFINE,
            _next,
            next(this.#phonies(values), this.__next),
            body.complete(values, next),
          ];
        });
      }
      case TokenType.WHILE: {
        const { condition, onTrue, label } = node as WhileStatement;
        const _head = label ||
          ["WHILE", node.token.line, node.token.column, 0].join("_");
        const _next = ["WHILE", node.token.line, node.token.column, 1].join(
          "_",
        );
        const head: CPS<number> = this.__bool(condition).bind(
          (it) => it ? this.block(onTrue) : CPS.unit(this.__break),
        ).bind((goto) => {
          if (label) {
            switch (goto) {
              case this.store.string(`<continue ${label}>`):
                return this.#goto(_head);
              case this.store.string(`<break ${label}>`):
                return this.#goto(_next);
              default:
                break;
            }
          }
          switch (goto) {
            case this.__break:
              return this.#goto(_next);
            case this.__continue:
            case this.__next:
              return this.#goto(_head);
            default:
              return CPS.unit(goto);
          }
        });
        return new CPS((
          values,
          next,
        ) => {
          const phonies = this.#phonies(values);
          return [
            LabelType.DEFINE,
            _next,
            next(phonies, this.__next),
            [
              LabelType.DEFINE,
              _head,
              head.complete(phonies, next),
              [LabelType.GOTO, _head, values],
            ],
          ];
        });
      }
      default:
        return this.expression(node as Expression).map((_) => this.__next);
    }
  }
}
