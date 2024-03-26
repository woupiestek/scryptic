import { NumberTrie } from "../numberTrie2.ts";
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
          graph = this.ifThenElse(
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
          const head = this.ifThenElse(condition, key, cont);
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

  ifThenElse(
    condition: Expression,
    thenBranch: Graph,
    elseBranch: Graph,
  ): Graph {
    switch (condition.token.type) {
      case TokenType.AND: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(
          left,
          this.ifThenElse(right, thenBranch, elseBranch),
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
        return this.ifThenElse(
          left,
          thenBranch,
          this.ifThenElse(right, thenBranch, elseBranch),
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
  | [ValueType.Not, ValueQ]
  | [ValueType.Phi, number]
  | [ValueType.SetField, ValueQ, ValueQ, string, ValueQ];

export class Value {
  constructor(
    readonly key: number,
    readonly token: Token,
    readonly data: Data,
  ) {}
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
  children: { [_: number]: Trie<A> } = {};
}
class Store {
  strings: Trie<number> = new Trie();
  values: Trie<Value> = new Trie();
  #key = 3;
  reduce(
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
    let trie = this.strings;
    for (let i = 0; i < data.length; i++) {
      trie = trie.children[data.charCodeAt(i)] ||= new Trie();
    }
    return trie.value ||= this.#stringKey++;
  }
  value(token: Token, data: Data): Value {
    let trie = this.values;
    for (const key of data) {
      trie = trie.children[this.reduce(key)] ||= new Trie();
    }
    return trie.value ||= new Value(this.#key++, token, data);
  }
  list() {
    let list = NumberTrie.empty();
    const tries = [];
    let trie = this.values;
    for (;;) {
      if (trie.value) {
        list = list.set(trie.value.key, trie.value.toString());
      }
      tries.push(...Object.values(trie.children));
      if (tries.length === 0) return list.toString();
      trie = tries.pop() as Trie<Value>;
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
  constructor(readonly complete: (next: (_: A) => Label) => Label) {}
  mu<B>(f: (_: A) => CPS<B>): CPS<B> {
    return new CPS((next) => this.complete((a) => f(a).complete(next)));
  }
  static eta<A>(a: A): CPS<A> {
    return new CPS((next) => next(a));
  }
  map<B>(f: (_: A) => B): CPS<B> {
    return new CPS((next) => this.complete((a) => next(f(a))));
  }
}

export class Optimizer {
  static #TOKEN = new Token(TokenType.ERROR, 0, 0, 0, 0);
  store = new Store();
  #NEXT = this.store.string("<next>");
  #VALUE = this.store.string("<value>");
  #WORLD = this.store.string("<world>");

  static #error<A>(token: Token, message: string): CPS<A> {
    return new CPS((_) => [LabelType.ERROR, token, message]);
  }

  assign(
    node: Binary,
    values: NumberTrie<Value>,
  ): CPS<NumberTrie<Value>> {
    switch (node.left.token.type) {
      case TokenType.DOT: {
        const { object, field } = node.left as Access;
        return this.expression(object, values).mu(
          (v1) => {
            const x = v1.get(this.#VALUE);
            return this.expression(
              node.right,
              v1,
            ).map(
              (v2) =>
                v2.set(
                  this.#WORLD,
                  this.store.value(node.token, [
                    ValueType.SetField,
                    v2.get(this.#WORLD),
                    x,
                    field,
                    v2.get(this.#VALUE),
                  ]),
                ),
            );
          },
        );
      }
      case TokenType.IDENTIFIER: {
        const { name } = node.left as Variable;
        const index = this.store.string(name);
        if (index === -1) {
          return Optimizer.#error(node.left.token, "Undeclared variable");
        }
        return this.expression(
          node.right,
          values,
        ).map(
          (values) => {
            const value = values.get(this.#VALUE);
            return value
              ? values.set(2 + index, value)
              : values.delete(2 + index);
          },
        );
      }
      case TokenType.VAR: {
        const varDecl = node.left as VarDeclaration;
        const { token, name } = varDecl.key;
        const index = this.store.string(name);
        const other = values.get(index);
        if (other !== undefined) {
          return Optimizer.#error(
            node.left.token,
            `Variable already declared at (${other.token.line},${other.token.column})`,
          );
        }
        values = values.set(
          index,
          this.store.value(token, [ValueType.Declared]),
        );
        return this.expression(
          node.right,
          values,
        ).map(
          (values) => {
            const value = values.get(this.#VALUE);
            return value ? values.set(index, value) : values.delete(index);
          },
        );
      }
      default:
        return Optimizer.#error(node.token, "Impossible assignment");
    }
  }

  // there is no such thing
  simpleExpression(
    node: Expression,
    values: NumberTrie<Value>,
  ): ValueQ | string {
    switch (node.token.type) {
      case TokenType.FALSE:
      case TokenType.STRING:
      case TokenType.TRUE: {
        const { value } = node as Literal;
        return this.store.literal(node.token, value);
      }
      case TokenType.IDENTIFIER: {
        const { name } = node as Variable;
        const index = this.store.string(name);
        const value = values.get(index);
        if (!value) {
          return "Undeclared variable";
        }
        if (value.data[0] === ValueType.Declared) {
          return "Unassigned variable";
        }
        return value;
      }
      case TokenType.NEW: {
        const { token, klaz } = node as New;
        return this.store.value(token, [ValueType.New, klaz]);
      }
      case TokenType.NOT:
        // todo: constant propoagation
        return this.store.value(node.token, [
          ValueType.Not,
          values.get(this.#VALUE),
        ]);
      // case TokenType.THIS:

      default:
        return "expression expected";
    }
  }

  bool(
    token: Token,
    value: boolean,
    values: NumberTrie<Value>,
  ): CPS<NumberTrie<Value>> {
    return CPS.eta(
      values.set(
        this.#VALUE,
        this.store.literal(token, value),
      ),
    );
  }

  expression(
    node: Expression,
    values: NumberTrie<Value>,
  ): CPS<NumberTrie<Value>> {
    switch (node.token.type) {
      case TokenType.AND: {
        const { left, right } = node as Binary;
        return this.ifThenElse(
          left,
          values,
        ).mu((l) =>
          l.on
            ? this.expression(right, l.values)
            : this.bool(left.token, false, l.values)
        );
      }
      case TokenType.BE:
        return this.assign(node as Binary, values);
      case TokenType.DOT: {
        const { object, field } = node as Access;
        return this.expression(object, values).map((values) => {
          const dot = this.store.value(
            node.token,
            [
              ValueType.GetField,
              values.get(this.#WORLD),
              values.get(this.#VALUE),
              field,
            ],
          );
          return values.set(this.#VALUE, dot);
        });
      }
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE: {
        const { token, left, right } = node as Binary;
        return this.expression(left, values).mu((v) =>
          this.expression(right, v).map((w) =>
            // todo: constant propagation
            w.set(
              this.#VALUE,
              this.store.value(token, [
                ValueType.Comparison,
                v.get(this.#VALUE),
                node.token.type,
                w.get(this.#VALUE),
              ]),
            )
          )
        );
      }
      case TokenType.LOG: {
        const { token, value } = node as Log;
        return this.expression(value, values).map((values) =>
          values.set(
            this.#WORLD,
            this.store.value(token, [
              ValueType.Log,
              values.get(this.#WORLD),
              values.get(this.#VALUE),
            ]),
          )
        );
      }
      case TokenType.OR: {
        const { left, right } = node as Binary;
        return this.ifThenElse(left, values).mu((l) =>
          l.on
            ? this.bool(left.token, true, l.values)
            : this.expression(right, l.values)
        );
      }
      case TokenType.PAREN_LEFT: {
        const { token, operator, operands } = node as Call;
        return this.expression(operator, values).mu((v) => {
          const f: ValueQ = v.get(this.#VALUE);
          if (operands.length === 0) {
            const y = this.store.value(token, [
              ValueType.Call,
              v.get(this.#WORLD) as ValueQ,
              f,
            ]);
            return CPS.eta(
              v.set(this.#VALUE, y).set(this.#WORLD, y),
            );
          }
          const x: ValueQ[] = [];
          let a = this.expression(operands[0], v).map((v) => {
            x[0] = v.get(this.#VALUE);
            return v;
          });
          for (let i = 1; i < operands.length; i++) {
            a = a.mu((v) =>
              this.expression(operands[i], v).map((v) => {
                x[i] = v.get(this.#VALUE);
                return v;
              })
            );
          }
          return a.map((w) => {
            const y = this.store.value(token, [
              ValueType.Call,
              w.get(this.#WORLD) as ValueQ,
              f,
              ...x,
            ]);
            return w.set(this.#VALUE, y).set(this.#WORLD, y);
          });
        });
      }
      case TokenType.VAR: {
        const varDecl = node as VarDeclaration;
        const { name } = varDecl.key;
        const index = this.store.string(name);
        const value = values.get(index);
        if (value) {
          return Optimizer.#error(
            varDecl.token,
            `Variable already existed at (${value.token.line},${value.token.column})`,
          );
        }
        return CPS.eta(
          values.set(
            index,
            this.store.value(varDecl.token, [ValueType.Declared]),
          ).delete(this.#VALUE),
        );
      }
      default: {
        const v = this.simpleExpression(node, values);
        if (typeof v === "string") {
          return Optimizer.#error(node.token, v);
        }
        return CPS.eta(
          v ? values.set(this.#VALUE, v) : values.delete(this.#VALUE),
        );
      }
    }
  }

  _jump(
    token: Token,
    jump: Jump | undefined,
    values: NumberTrie<Value>,
  ): CPS<{
    target: number;
    values: NumberTrie<Value>;
  }> {
    if (!jump) {
      return CPS.eta({ target: this.#NEXT, values });
    }
    switch (jump.token.type) {
      case TokenType.BREAK: {
        const { label } = jump as Break;
        return CPS.eta({
          target: this.store.string(label ? `<break ${label}>` : "<break>"),
          values,
        });
      }
      case TokenType.CONTINUE: {
        const { label } = jump as Continue;
        return CPS.eta({
          target: this.store.string(
            label ? `<continue ${label}>` : "<continue>",
          ),
          values,
        });
      }
      case TokenType.RETURN: {
        const { expression } = jump as Return;
        if (expression) {
          return new CPS((_) =>
            this.expression(expression, values).complete((values) => [
              LabelType.RETURN,
              values.get(this.#WORLD),
              values.get(this.#VALUE),
            ])
          );
        } else {
          return new CPS((_) => [
            LabelType.RETURN,
            values.get(this.#WORLD),
            undefined,
          ]);
        }
      }
    }
    return Optimizer.#error(token, "nowhere to go from here");
  }

  statements(
    statements: Statement[],
    values: NumberTrie<Value>,
  ): CPS<{
    target: number;
    values: NumberTrie<Value>;
  }> {
    if (statements.length === 0) {
      return CPS.eta({ target: this.#NEXT, values });
    }
    let y = this.statement(statements[0], values);
    for (let i = 1; i < statements.length; i++) {
      y = y.mu((goto) => {
        if (goto.target === this.#NEXT) {
          return this.statement(statements[i], goto.values);
        }
        return CPS.eta(goto);
      });
    }
    return y;
  }

  block(
    block: Block,
    values: NumberTrie<Value>,
  ): CPS<{
    target: number;
    values: NumberTrie<Value>;
  }> {
    return (this.statements(block.statements, values).mu((goto) => {
      if (goto.target === this.#NEXT) {
        return this._jump(block.token, block.jump, goto.values);
      }
      return CPS.eta(goto);
    })).map((goto) => {
      // scoping
      let gv = goto.values;
      for (const [k, _] of goto.values.entries()) {
        if (!values.get(k)) gv = gv.delete(k);
      }
      goto.values = gv;
      return goto;
    });
  }

  ifThenElse(
    condition: Expression,
    values: NumberTrie<Value>,
  ): CPS<{ on: boolean; values: NumberTrie<Value> }> {
    switch (condition.token.type) {
      case TokenType.AND: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(
          left,
          values,
        ).mu((l) => l.on ? this.ifThenElse(right, l.values) : CPS.eta(l));
      }
      case TokenType.BE: {
        const { token, left, right } = condition as Binary;
        return this.ifThenElse(
          right,
          values,
        ).mu((r) =>
          this.assign(
            new Binary(token, left, new Literal(token, r.on)),
            r.values,
          ).map((v) => ({ on: r.on, values: v }))
        );
      }
      case TokenType.FALSE:
        return CPS.eta({ on: false, values });
      case TokenType.LOG: {
        const { token, value } = condition as Log;
        return this.ifThenElse(
          value,
          values,
        ).mu((v) =>
          this.expression(
            new Log(token, new Literal(token, v.on)),
            v.values,
          ).map((w) => ({ on: v.on, values: w }))
        );
      }
      case TokenType.NOT: {
        const { expression } = condition as Not;
        return this.ifThenElse(expression, values).map((
          { on, values },
        ) => ({
          on: !on,
          values,
        }));
      }
      case TokenType.OR: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(
          left,
          values,
        ).mu((l) => {
          if (l.on) return CPS.eta(l);
          return this.ifThenElse(right, l.values);
        });
      }
      case TokenType.TRUE:
        return CPS.eta({ on: false, values });
      default:
        return this.expression(condition, values).mu(
          (v: NumberTrie<Value>) => {
            const c = v.get(this.#VALUE);
            if (!c) {
              return Optimizer.#error(
                condition.token,
                "bad condition expression",
              );
            }
            return new CPS((next) => [
              LabelType.IF,
              c,
              next({ on: true, values: v }),
              next({ on: false, values: v }),
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

  statement(
    node: Statement,
    values: NumberTrie<Value>,
  ): CPS<{
    target: number;
    values: NumberTrie<Value>;
  }> {
    // jump target
    switch (node.token.type) {
      case TokenType.BRACE_LEFT: {
        return this.block(node as Block, values);
      }
      case TokenType.IF: {
        const { condition, onTrue, onFalse } = node as IfStatement;
        return this.ifThenElse(condition, values).mu((it) => {
          if (it.on) return this.block(onTrue, it.values);
          if (onFalse) return this.block(onFalse, it.values);
          return this.#next(it.values);
        });
      }
      case TokenType.WHILE: {
        const { condition, onTrue, label } = node as WhileStatement;
        const _label = label ||
          ["WHILE", node.token.line, node.token.column].join("_");
        // this is where the phonies seem necessary
        const head: CPS<{
          target: number;
          values: NumberTrie<Value>;
        }> = this.ifThenElse(condition, this.#phonies(values)).mu(
          (it) => {
            if (!it.on) return this.#next(it.values);
            return this.block(onTrue, it.values).mu((goto) => {
              if (
                goto.target === this.#NEXT ||
                goto.target === this.store.string("<continue>") ||
                (label &&
                  goto.target === this.store.string(`<continue ${label}>`))
              ) {
                return new CPS((_) => [LabelType.GOTO, _label, goto.values]);
              }
              if (
                goto.target === this.store.string("<break>") ||
                (label && goto.target === this.store.string(`<break ${label}>`))
              ) {
                return this.#next(goto.values);
              }
              return CPS.eta(goto);
            });
          },
        );
        return new CPS((
          next,
        ) => [LabelType.DEFINE, _label, head.complete(next), [
          LabelType.GOTO,
          _label,
          values,
        ]]);
      }
      default:
        return this.expression(node as Expression, values).map((
          values,
        ) => ({
          target: this.#NEXT,
          values,
        }));
    }
  }

  #next(values: NumberTrie<Value>): CPS<{
    target: number;
    values: NumberTrie<Value>;
  }> {
    return CPS.eta({ target: this.#NEXT, values });
  }
}
