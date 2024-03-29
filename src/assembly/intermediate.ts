import { NumberTrie } from "../numberTrie2.ts";
import { SplayMap } from "../splay2.ts";
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

function expressionString(expression: Expression): string {
  switch (expression.constructor) {
    case Access:
      return tupleString(
        TokenType[expression.token.type],
        expressionString((expression as Access).object),
        (expression as Access).field,
      );
    case Binary:
      return tupleString(
        TokenType[expression.token.type],
        expressionString((expression as Binary).left),
        expressionString((expression as Binary).right),
      );
    case Call:
      return tupleString(
        TokenType[expression.token.type],
        expressionString((expression as Call).operator),
        ...(expression as Call).operands.map(expressionString),
      );
    case Literal:
      return JSON.stringify((expression as Literal).value);
    case Log:
      return tupleString(
        TokenType[expression.token.type],
        expressionString((expression as Log).value),
      );
    case New:
      return tupleString(
        TokenType[expression.token.type],
        (expression as New).klaz,
      );
    case Not:
      return tupleString(
        TokenType[expression.token.type],
        expressionString((expression as Not).expression),
      );
    case VarDeclaration:
      return tupleString(
        TokenType[expression.token.type],
        expressionString((expression as VarDeclaration).key),
      );
    case Variable:
      return tupleString(
        TokenType[expression.token.type],
        (expression as Variable).name,
      );
    default:
      return "[ERROR]";
  }
}

export enum GraphType {
  BLOCK,
  IF,
  RETURN,
}
export type Graph =
  | [GraphType.BLOCK, Expression[], Graph]
  | [GraphType.IF, Expression, Graph, Graph]
  | [GraphType.RETURN, Expression]
  | [GraphType.RETURN];

function loop(
  key: Graph,
  value: Graph,
  inside: Graph,
  started: Set<Graph> = new Set(),
) {
  if (key === inside) throw new Error("impossible loop");
  if (started.has(inside)) return;
  started.add(inside);
  switch (inside[0]) {
    case GraphType.BLOCK:
      if (inside[2] === key) inside[2] = value;
      loop(key, value, inside[2], started);
      break;
    case GraphType.IF:
      if (inside[2] === key) inside[2] = value;
      loop(key, value, inside[2], started);
      if (inside[3] === key) inside[3] = value;
      loop(key, value, inside[3], started);
      break;
    default:
      break;
  }
}

export function stringifyGraph(graph: Graph) {
  const graphs = [graph];
  const results: string[] = [];
  function graphIndex(graph: Graph) {
    let i = graphs.indexOf(graph);
    if (i < 0) {
      i = graphs.length;
      graphs[i] = graph;
    }
    return i;
  }

  for (let i = 0; i < graphs.length; i++) {
    const graph = graphs[i];
    switch (graph[0]) {
      case GraphType.BLOCK:
        results[i] = [
          `${i} => BLOCK`,
          ...graph[1].map(expressionString),
          "GOTO " + graphIndex(graph[2]),
        ].join("\n  ");
        continue;
      case GraphType.IF:
        results[i] = [
          `${i} => IF`,
          expressionString(graph[1]),
          "THEN",
          graphIndex(graph[2]),
          "ELSE",
          graphIndex(graph[3]),
        ].join(" ");
        continue;
      case GraphType.RETURN:
        results[i] = [
          `${i} => RETURN`,
          graph[1] ? expressionString(graph[1]) : "",
        ].join(" ");
        continue;
    }
  }
  return results.join("\n");
}

export class Grapher {
  #labels: { label?: string; break: Graph; continue: Graph }[] = [];
  #getLabel(label?: string) {
    if (label !== undefined) {
      for (const l of this.#labels) {
        if (l.label === label) {
          return l;
        }
      }
    } else {
      if (this.#labels.length > 0) {
        return this.#labels[this.#labels.length - 1];
      }
    }
    throw new Error("missing label " + label);
  }
  jumpToGraph(jump: Jump): Graph {
    switch (jump?.constructor) {
      case Break: {
        const { label } = jump as Break;
        return this.#getLabel(label).break;
      }
      case Continue: {
        const { label } = jump as Continue;
        return this.#getLabel(label).continue;
      }
      case Return: {
        const { expression } = jump as Return;
        return expression ? [GraphType.RETURN, expression] : [GraphType.RETURN];
      }
      default:
        throw new Error("Unexpected type of jump");
    }
  }
  blockToGraph(block: Block, graph: Graph): Graph {
    const { statements, jump } = block;
    return this.statementsToGraph(
      statements,
      jump === undefined ? graph : this.jumpToGraph(jump),
    );
  }
  statementsToGraph(
    statements: Statement[],
    graph: Graph,
  ): Graph {
    const expressions: Expression[] = [];
    a: for (let i = 0; i < statements.length; i++) {
      switch (statements[i].constructor) {
        case Block:
          graph = this.blockToGraph(
            statements[i] as Block,
            this.statementsToGraph(statements.slice(i + 1), graph),
          );
          break a;
        case IfStatement: {
          const cont = this.statementsToGraph(statements.slice(i + 1), graph);
          const { condition, onTrue, onFalse } = statements[i] as IfStatement;
          graph = this.__bool(
            condition,
            this.blockToGraph(onTrue, cont),
            onFalse === undefined ? cont : this.blockToGraph(onFalse, cont),
          );
          break a;
        }
        case WhileStatement: {
          const cont = this.statementsToGraph(statements.slice(i + 1), graph);
          const { condition, onTrue, label } = statements[i] as WhileStatement;
          const key: Graph = [
            GraphType.RETURN,
          ];
          const head = this.__bool(condition, key, cont);
          this.#labels.push({ label, break: cont, continue: head });
          const value = this.blockToGraph(onTrue, cont);
          this.#labels.pop();
          graph = key === head ? value : head;
          loop(key, value, graph);
          break a;
        }
        default:
          expressions.push(statements[i] as Expression);
          continue;
      }
    }
    if (expressions.length > 0) {
      return [GraphType.BLOCK, expressions, graph];
    }
    return graph;
  }

  __bool(
    condition: Expression,
    thenBranch: Graph,
    elseBranch: Graph,
  ): Graph {
    switch (condition.token.type) {
      case TokenType.AND: {
        const { left, right } = condition as Binary;
        return this.__bool(
          left,
          this.__bool(right, thenBranch, elseBranch),
          elseBranch,
        );
      }
      case TokenType.BE:
      case TokenType.DOT:
      case TokenType.IDENTIFIER:
      case TokenType.IS:
      case TokenType.IS_NOT:
      case TokenType.LESS:
      case TokenType.LOG:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.VAR:
        return [GraphType.IF, condition, thenBranch, elseBranch];
      case TokenType.FALSE:
        return elseBranch;
      case TokenType.NOT: {
        const { expression } = condition as Not;
        return [GraphType.IF, expression, elseBranch, thenBranch];
      }
      case TokenType.OR: {
        const { left, right } = condition as Binary;
        return this.__bool(
          left,
          thenBranch,
          this.__bool(right, thenBranch, elseBranch),
        );
      }
      case TokenType.TRUE:
        return thenBranch;
      default:
        throw new Error(
          `Illegal condition expression '${expressionString(condition)}'.`,
        );
    }
  }
}

export class DGraph {
  free = new Set<string>();
  assigns = new Map<string, Expression>();
  constructor(readonly graph: Graph) {
    switch (graph[0]) {
      case GraphType.BLOCK:
        for (let i = 0, l = graph[1].length; i < l; i++) {
          graph[1][i] = this.rewrite(graph[1][i]);
        }
        return;
      case GraphType.IF:
        return;
      case GraphType.RETURN:
        if (graph[1]) this.rewrite(graph[1] as Expression);
    }
  }
  rewrite(expression: Expression): Expression {
    switch (expression.token.type) {
      case TokenType.AND: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.BE: {
        const { token, left, right } = expression as Binary;
        const _left = this.rewrite(left);
        const _right = this.rewrite(right);
        if (_left instanceof Variable) {
          this.assigns.set(_left.name, _right);
          return _right;
        }
        return new Binary(token, _left, _right);
      }
      case TokenType.DOT: {
        const { token, object, field } = expression as Access;
        return new Access(token, this.rewrite(object), field);
      }
      case TokenType.FALSE:
        return expression;
      case TokenType.IDENTIFIER: {
        const { name } = expression as Variable;
        const value = this.assigns.get(name);
        if (value) return value;
        this.free.add(name);
        return expression;
      }
      case TokenType.IS_NOT: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.IS: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.LESS: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.LOG: {
        const { token, value } = expression as Log;
        return new Log(token, this.rewrite(value));
      }
      case TokenType.MORE: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.NEW: {
        return expression;
      }
      case TokenType.NOT_LESS: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.NOT_MORE: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.NOT: {
        const { token, expression: e } = expression as Not;
        return new Not(token, e);
      }
      case TokenType.OR: {
        const { token, left, right } = expression as Binary;
        return new Binary(token, this.rewrite(left), this.rewrite(right));
      }
      case TokenType.PAREN_LEFT: {
        const { token, operator, operands } = expression as Call;
        return new Call(
          token,
          this.rewrite(operator),
          operands.map(this.rewrite),
        );
      }
      case TokenType.STRING:
        return expression;
      case TokenType.THIS: {
        this.free.add("this");
        return expression;
      }
      case TokenType.TRUE:
        return expression;
      case TokenType.VAR: {
        const { key } = expression as VarDeclaration;
        this.free.delete(key.name);
        return key;
      }
      default:
        throw new Error(
          "Not an expression " + TokenType[expression.token.type],
        );
    }
  }
}

export function dGraphs(graph: Graph): DGraph[] {
  const ins = [graph];
  const outs: DGraph[] = [];
  function add(g: Graph) {
    if (ins.indexOf(g) < 0) ins.push(g);
  }
  for (let i = 0; i < ins.length; i++) {
    const g = ins[i];
    switch (g[0]) {
      case GraphType.BLOCK:
        add(g[2]);
        break;
      case GraphType.IF:
        add(g[2]);
        add(g[3]);
        break;
      case GraphType.RETURN:
    }
    outs[i] = new DGraph(ins[i]);
  }
  return outs;
}

export function stringifyDGraph(graphs: DGraph[]) {
  const results: string[] = [];
  function graphIndex(graph: Graph) {
    return graphs.findIndex((it) => it.graph === graph);
  }
  for (let i = 0; i < graphs.length; i++) {
    const { free, graph, assigns } = graphs[i];
    const a = "{" + [...assigns.entries()].map(([k, v]) =>
      `${k} = ${expressionString(v)}`
    ).join(", ") + "}";
    const f = `(${[...free].join(", ")})`;
    switch (graph[0]) {
      case GraphType.BLOCK:
        results[i] = [
          `${i} => BLOCK${f}`,
          ...graph[1].map(expressionString),
          "GOTO " + graphIndex(graph[2]) + a,
        ].join("\n  ");
        continue;
      case GraphType.IF:
        results[i] = [
          `${i} => IF${f}`,
          expressionString(graph[1]),
          "THEN",
          graphIndex(graph[2]),
          "ELSE",
          graphIndex(graph[3]),
          a,
        ].join(" ");
        continue;
      case GraphType.RETURN:
        results[i] = [
          `${i} => RETURN${f}`,
          graph[1] ? expressionString(graph[1]) : "",
          a,
        ].join(" ");
        continue;
    }
  }
  return results.join("\n");
}

// new stuff

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
  children: SplayMap<Trie<A>> = new SplayMap();
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
        }]`;
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
  __next = this.store.string("<next>");
  __world = this.store.string("<world>");

  static #error<A>(token: Token, message: string): CPS<A> {
    return new CPS((_) => [LabelType.ERROR, token, message]);
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
          new CPS((_) => [LabelType.RETURN, w, undefined])
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

  #abstract: CPS<void> = new CPS((values, next) => {
    let phonies = NumberTrie.empty<Value>();
    for (const [k, v] of values.entries()) {
      if (v.data[0] === ValueType.Declared) {
        phonies = phonies.set(k, v);
      } else {
        phonies = phonies.set(k, this.store.value(v.token, [ValueType.Phi, k]));
      }
    }
    return next(phonies);
  });

  #goto<A>(_label: string): CPS<A> {
    return new CPS((values, _) => [LabelType.GOTO, _label, values]);
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
        const { condition, onTrue, onFalse } = node as IfStatement;
        return this.__bool(condition).bind((it) => {
          if (it) return this.block(onTrue);
          if (onFalse) return this.block(onFalse);
          return CPS.unit(this.__next);
        });
      }
      case TokenType.WHILE: {
        const { condition, onTrue, label } = node as WhileStatement;
        const _label = label ||
          ["WHILE", node.token.line, node.token.column].join("_");
        // this is where the phonies seem necessary
        const head: CPS<number> = this.#abstract.bind((_) =>
          this.__bool(condition).bind(
            (it) => {
              if (!it) return CPS.unit(this.__next);
              return this.block(onTrue).bind((goto) => {
                if (
                  goto === this.__next ||
                  goto === this.store.string("<continue>") ||
                  (label &&
                    goto === this.store.string(`<continue ${label}>`))
                ) {
                  return this.#goto(_label);
                }
                if (
                  goto === this.store.string("<break>") ||
                  (label && goto === this.store.string(`<break ${label}>`))
                ) {
                  return CPS.unit(this.__next);
                }
                return CPS.unit(goto);
              });
            },
          )
        );
        return new CPS((
          values,
          next,
        ) => [LabelType.DEFINE, _label, head.complete(values, next), [
          LabelType.GOTO,
          _label,
          values,
        ]]);
      }
      default:
        return this.expression(node as Expression).map((_) => this.__next);
    }
  }
}
