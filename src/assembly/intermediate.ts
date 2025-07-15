import { NumberTrie } from "../collections/numberTrie2.ts";
import { Table } from "../collections/table.ts";
import { Trie } from "../collections/trie.ts";
import { TokenType } from "./lex.ts";
import { NodeType } from "./parse.ts";
import { Parse } from "./parse2.ts";

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
    readonly token: number,
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

class Store {
  strings: Trie<number> = new Trie();
  targets: Table<Target> = new Table();
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
  literal(token: number, data: boolean | string): Value {
    return this.value(token, [ValueType.Literal, data]);
  }
  #stringKey = 0;
  string(data: string): number {
    return this.strings.getTrie(data.length, (i) => data.charCodeAt(i))
      .value ||= this.#stringKey++;
  }

  #targetKey = 0;
  target(key: number, target: Target) {
    this.targets.set(key, target);
  }
  reserve() {
    return this.#targetKey++;
  }

  value(token: number, data: Data): Value {
    return this.values.getTrie(data.length, (i) => this.__index(data[i]))
      .value ||= new Value(this.__key++, token, data);
  }

  list() {
    const pairs: string[] = [];
    for (const v of this.values.values()) {
      pairs.push(v.key + ": " + v.toString());
    }
    return "{" + pairs.join(", ") + "}";
  }

  targetString(): string {
    return this.targets.toString();
  }
}

export enum LabelType {
  ERROR,
  GOTO,
  IF,
  RETURN,
}

export class Target {
  constructor(
    readonly data:
      | [LabelType.ERROR, number, string]
      | [LabelType.GOTO, number, NumberTrie<Value>]
      | [LabelType.IF, Value, Target, Target]
      | [LabelType.RETURN, ValueQ, ValueQ],
  ) {}

  toString(): string {
    switch (this.data[0]) {
      case LabelType.ERROR:
        return `¡Error at token ${this.data[1]}: ${this.data[2]}!`;
      case LabelType.GOTO:
        return `${this.data[1]}(${
          [...this.data[2].entries()].map(([k, v]) => `${k}: ${v.key}`).join(
            ", ",
          )
        })`;
      case LabelType.IF:
        return `if ${this.data[1].key} then ${this.data[2].toString()} else ${
          this.data[3].toString()
        }`;
      case LabelType.RETURN:
        return `return ${this.data[1]?.key || -1} ${this.data[2]?.key || -1};`;
    }
  }
}

export class CPS<A> {
  constructor(
    readonly complete: (
      values: NumberTrie<Value>,
      next: (vs: NumberTrie<Value>, a: A) => Target,
    ) => Target,
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

  constructor(readonly parse: Parse) {}

  #error<A>(token: number, message: string): CPS<A> {
    return new CPS(() => new Target([LabelType.ERROR, token, message]));
  }

  updateWorld(f: (_?: Value) => Value): CPS<Value> {
    return CPS.get(this.__world).bind((w) => CPS.set(this.__world, f(w)));
  }

  #tokenType(node: number) {
    return this.parse.lex.types[this.parse.tokens[node]];
  }

  #lexeme(node: number) {
    return this.parse.lex.lexeme(this.parse.tokens[node]);
  }

  assign(
    node: number,
  ): CPS<Value> {
    const [left, right] = this.parse.children(node);
    return this.#assign(this.parse.tokens[node], left, this.expression(right));
  }

  #assign(token: number, left: number, right: CPS<Value>): CPS<Value> {
    switch (this.#tokenType(left)) {
      case TokenType.DOT: {
        const [object, field] = this.parse.children(left);
        return this.expression(object).bind(
          (x) => {
            return right.bind(
              (y) =>
                this.updateWorld((w) =>
                  this.store.value(token, [
                    ValueType.SetField,
                    w,
                    x,
                    this.#lexeme(field),
                    y,
                  ])
                ).map((_) => y),
            );
          },
        );
      }
      case TokenType.IDENTIFIER: {
        const name = this.#lexeme(left);
        const index = this.store.string(name);
        return CPS.get(index).bind((v) => {
          // still no good
          if (!v) {
            return this.#error(
              this.parse.tokens[left],
              "Assigning undeclared variable " + name,
            );
          }
          return right.bind((it) => CPS.set(index, it));
        });
      }
      case TokenType.VAR: {
        const token = this.parse.tokens[left - 1];
        const name = this.#lexeme(token);
        const index = this.store.string(name);
        return CPS.get(index).bind((other) => {
          if (other !== undefined) {
            return this.#error(
              token,
              `Variable ${name} already declared at token ${other.token}`,
            );
          }
          return right.bind((it) => CPS.set(index, it));
        });
      }
      default:
        return this.#error(token, "Impossible assignment");
    }
  }

  negate(token: number, value?: Value): Value {
    if (value === undefined) throw this.#error(token, `Cannot negate`);
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
            throw this.#error(token, "bad comparison");
        }
        return this.compare(token, value.data[1], type, value.data[3]);
      }
      case ValueType.Literal:
        if (typeof value.data[1] === "string") {
          throw this.#error(token, "cannot negate string");
        }
        return this.store.literal(token, !value.data[1]);
      case ValueType.Not:
        return value.data[1];
      default:
        throw this.#error(token, "Cannot negate " + value.toString());
    }
  }

  bool(
    token: number,
    value: boolean,
  ): CPS<Value> {
    return CPS.unit(
      this.store.literal(token, value),
    );
  }

  expression(
    node: number,
  ): CPS<Value> {
    switch (this.#tokenType(node)) {
      case TokenType.AND: {
        const [left, right] = this.parse.children(node);
        return this.__bool(left).bind((l) =>
          l ? this.expression(right) : this.bool(this.parse.tokens[left], false)
        );
      }
      case TokenType.BE:
        return this.assign(node);
      case TokenType.DOT: {
        const [object, field] = this.parse.children(node);
        return this.expression(object).bind((value) =>
          CPS.get(this.__world).map((w) =>
            this.store.value(
              this.parse.tokens[node],
              [
                ValueType.GetField,
                w,
                value,
                this.#lexeme(field),
              ],
            )
          )
        );
      }
      case TokenType.FALSE:
        return CPS.unit(this.store.literal(this.parse.tokens[node], false));
      case TokenType.STRING:
        return CPS.unit(
          this.store.literal(
            this.parse.tokens[node],
            JSON.parse(this.#lexeme(node)),
          ),
        );
      case TokenType.TRUE:
        return CPS.unit(this.store.literal(this.parse.tokens[node], false));
      case TokenType.IDENTIFIER: {
        const name = this.#lexeme(node);
        const index = this.store.string(name);
        return CPS.get(index).bind((value) => {
          if (value === undefined) {
            return this.#error(
              this.parse.tokens[node],
              "Reading undeclared variable " + name,
            );
          }
          if (value.data[0] === ValueType.Declared) {
            return this.#error(
              this.parse.tokens[node],
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
        const [left, right] = this.parse.children(node);
        return this.expression(left).bind((l) =>
          this.expression(right).map((r) =>
            this.compare(this.parse.tokens[node], l, this.#tokenType(node), r)
          )
        );
      }
      case TokenType.LOG: {
        const [value] = this.parse.children(node);
        console.log(this.parse.children(node));
        return this.expression(value).bind((v) =>
          this.updateWorld((w) =>
            this.store.value(this.parse.tokens[node], [ValueType.Log, w, v])
          ).map((_) => v)
        );
      }
      case TokenType.NEW: {
        // should be treated as effectful
        const klaz = this.#lexeme(node - 1);
        return CPS.unit(
          this.store.value(this.parse.tokens[node], [ValueType.New, klaz]),
        );
      }
      case TokenType.NOT: {
        return this.expression(node - 1).map((v) =>
          this.negate(this.parse.tokens[node - 1], v)
        );
      }
      // case TokenType.THIS:
      case TokenType.OR: {
        const [left, right] = this.parse.children(node);
        return this.__bool(left).bind((l) =>
          l ? this.bool(this.parse.tokens[left], true) : this.expression(right)
        );
      }
      case TokenType.PAREN_LEFT: {
        const [operator, ...operands] = this.parse.children(node);
        return this.expression(operator).bind((f) => {
          if (operands.length === 0) {
            return this.updateWorld((w) =>
              this.store.value(this.parse.tokens[node], [ValueType.Call, w, f])
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
              this.store.value(this.parse.tokens[node], [
                ValueType.Call,
                w,
                f,
                ...x,
              ])
            )
          );
        });
      }
      case TokenType.VAR: {
        const name = this.#lexeme(node - 1);
        const index = this.store.string(name);
        return CPS.get(index).bind((value) => {
          if (value) {
            return this.#error(
              this.parse.tokens[node - 1],
              `Variable ${name} already existed at token ${value.token}`,
            );
          }
          return CPS.set(
            index,
            this.store.value(this.parse.tokens[node], [ValueType.Declared]),
          );
        });
      }
      case undefined:
        throw new Error("new problem");
      default:
        return this.#error(this.parse.tokens[node], "expression expected");
    }
  }

  compare(
    token: number,
    left: Value | undefined,
    comparison: TokenType,
    right: Value | undefined,
  ): Value {
    if (!left || !right) {
      throw this.#error(token, "bad comparison");
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
                throw this.#error(token, "bad comparison");
            }
            return this.store.literal(token, literal);
          }
          default:
            break;
        }
        throw this.#error(token, "bad comparison right hand side");
      default:
        break;
    }
    throw this.#error(token, "bad comparison left hand side");
  }

  _jump(
    token: number,
    jump?: number,
  ): CPS<number> {
    if (jump === undefined) {
      return CPS.unit(this.__next);
    }
    switch (this.#tokenType(jump)) {
      case TokenType.BREAK: {
        const [label] = this.parse.children(jump);
        return CPS.unit(
          this.store.string(
            label === undefined ? "<break>" : `<break ${this.#lexeme(label)}>`,
          ),
        );
      }
      case TokenType.CONTINUE: {
        const [label] = this.parse.children(jump);
        return CPS.unit(this.store.string(
          label === undefined ? "<continue>" : `<continue ${label}>`,
        ));
      }
      case TokenType.RETURN: {
        const [expression] = this.parse.children(jump);
        if (expression !== undefined) {
          return this.expression(expression).bind((v) =>
            CPS.get(this.__world).bind((w) =>
              new CPS(() => new Target([LabelType.RETURN, w, v]))
            )
          );
        }
        return CPS.get(this.__world).bind((w) =>
          new CPS(() => new Target([LabelType.RETURN, w, undefined]))
        );
      }
    }
    return this.#error(token, "nowhere to go from here");
  }

  statements(statements: number[], index = 0): CPS<number> {
    return statements.length === index
      ? CPS.unit(this.__next)
      : this.statement(statements[index]).bind(
        (goto) =>
          goto === this.__next
            ? this.statements(statements, index + 1)
            : CPS.unit(goto),
      );
  }

  block(
    block: number,
  ): CPS<number> {
    const children = this.parse.children(block);
    const jump =
      this.parse.types[children[children.length - 1]] === NodeType.JUMP
        ? children.pop()
        : undefined;
    // extra steps needed to reset the scope...
    return new CPS<Set<number>>((values, next) =>
      next(values, new Set([...values.entries()].map(([k, _]) => k)))
    ).bind((scope) =>
      (this.statements(children).bind((goto) => {
        if (goto === this.__next) {
          return this._jump(this.parse.tokens[block], jump);
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
    condition: number,
  ): CPS<boolean> {
    switch (this.#tokenType(condition)) {
      case TokenType.AND: {
        const [left, right] = this.parse.children(condition);
        return this.__bool(left).bind((l) =>
          l ? this.__bool(right) : CPS.unit(false)
        );
      }
      case TokenType.BE: {
        const [left, right] = this.parse.children(condition);
        const token = this.parse.tokens[condition];
        return this.__bool(right).bind((r) =>
          this.#assign(token, left, CPS.unit(this.store.literal(token, r))).map(
            (_) => r,
          )
        );
      }
      case TokenType.FALSE:
        return CPS.unit(false);
      case TokenType.LOG: {
        const token = this.parse.tokens[condition];
        return this.__bool(condition - 1).bind((v) =>
          this.updateWorld((w) =>
            this.store.value(token, [
              ValueType.Log,
              w,
              this.store.literal(token, v),
            ])
          ).map((_) => v)
        );
      }
      case TokenType.NOT: {
        return this.__bool(condition - 1).map((on) => !on);
      }
      case TokenType.OR: {
        const [left, right] = this.parse.children(condition);
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
              return this.#error(
                this.parse.tokens[condition],
                "condition without value",
              );
            }
            if (c.data[0] === ValueType.Literal) {
              const on = c.data[1];
              if (typeof on === "boolean") {
                return CPS.unit(on);
              }
              throw this.#error(
                this.parse.tokens[condition],
                "condition not boolean",
              );
            }
            return new CPS((values, next) =>
              new Target([
                LabelType.IF,
                c,
                next(values, true),
                next(values, false),
              ])
            );
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
        phonies = phonies.set(
          k,
          this.store.value(v.token, [ValueType.Phi, k]),
        );
      }
    }
    return phonies;
  }

  #goto<A>(label: number): CPS<A> {
    return new CPS((values, _) => new Target([LabelType.GOTO, label, values]));
  }

  statement(
    node: number,
  ): CPS<number> {
    // jump target
    switch (this.#tokenType(node)) {
      case TokenType.BRACE_LEFT: {
        return this.block(node);
      }
      case TokenType.IF: {
        const [condition, onTrue, onFalse] = this.parse.children(node);
        const target = this.store.reserve();
        const body: CPS<number> = this.__bool(condition).bind((it) => {
          if (it) return this.block(onTrue);
          if (onFalse) return this.block(onFalse);
          return CPS.unit(this.__next);
        }).bind((goto) => {
          if (goto === this.__next) return this.#goto(target);
          return CPS.unit(goto);
        });
        // now what?
        return new CPS((values, next) => {
          this.store.target(target, next(this.#phonies(values), this.__next));
          return body
            .complete(values, next);
        });
      }
      case TokenType.WHILE: {
        const children = this.parse.children(node);
        const label = children.length === 3 ? children.shift() : undefined;
        const [condition, onTrue] = children;
        const _head = this.store.reserve();
        const _next = this.store.reserve();
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
          this.store.target(_next, next(phonies, this.__next));
          this.store.target(_head, head.complete(phonies, next));
          return new Target([LabelType.GOTO, _head, values]);
        });
      }
      default:
        return this.expression(node).map((_) => this.__next);
    }
  }

  collectTarget(
    target: Target,
    values: Table<Value>,
    keys: Set<number> = new Set(),
  ) {
    switch (target.data[0]) {
      case LabelType.ERROR:
        break;
      case LabelType.GOTO: {
        if (!keys.has(target.data[1])) {
          keys.add(target.data[1]);
          const t = this.store.targets.get(target.data[1]);
          if (t) this.collectTarget(t, values, keys);
        }
        for (const [_, v] of target.data[2].entries()) {
          this.collectValue(v, values);
        }
        break;
      }
      case LabelType.IF:
        this.collectValue(target.data[1], values);
        this.collectTarget(target.data[2], values, keys);
        this.collectTarget(target.data[3], values, keys);
        break;
      case LabelType.RETURN:
        if (target.data[1]) this.collectValue(target.data[1], values);
        if (target.data[2]) this.collectValue(target.data[2], values);
    }
  }

  collectValue(
    value: Value,
    values: Table<Value>,
  ) {
    if (values.get(value.key)) return;
    values.set(value.key, value);
    for (const k of value.data) {
      if (k instanceof Value) {
        this.collectValue(k, values);
      }
    }
  }
}
