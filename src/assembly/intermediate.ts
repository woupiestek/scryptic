import { SplayMap } from "../splay.ts";
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
  | [ValueType.Literal, boolean | string]
  | [ValueType.Log, ValueQ, ValueQ]
  | [ValueType.New, string]
  | [ValueType.Not, ValueQ]
  | [ValueType.Phi, string]
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
          return i ? TokenType[it] : ValueType[it];
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
class Trie {
  value?: Value;
  children: { [_: number | string]: Trie } = {};
}
class Store {
  trie: Trie = { children: {} };
  key = 3;
  static #reduce(
    key: string | boolean | TokenType | ValueQ | ValueType,
  ): string | number {
    switch (typeof key) {
      case "string":
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
  value(token: Token, data: Data): Value {
    let t = this.trie;
    for (const key of data) {
      const k = Store.#reduce(key);
      t.children[k] ||= new Trie();
      t = t.children[k];
    }
    return t.value ||= new Value(this.key++, token, data);
  }
  list() {
    const list: { [_: number]: string } = {};
    const tries = [];
    let trie = this.trie;
    for (;;) {
      if (trie.value) {
        list[trie.value.key] = trie.value.toString();
      }
      tries.push(...Object.values(trie.children));
      if (tries.length === 0) return list;
      trie = tries.pop() as Trie;
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
  | [LabelType.GOTO, string, SplayMap<Value>]
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
  store = new Store();
  static #NEXT = "<next>";
  static #VALUE = "<value>";
  static #WORLD = "<world>";

  static #error<A>(token: Token, message: string): CPS<A> {
    return new CPS((_) => [LabelType.ERROR, token, message]);
  }

  assign(
    node: Binary,
    scope: Variable[],
    values: SplayMap<Value>,
  ): CPS<SplayMap<Value>> {
    switch (node.left.token.type) {
      case TokenType.DOT: {
        const { object, field } = node.left as Access;
        return this.expression(object, scope, values).mu(
          (v1) => {
            const x = v1.select(Optimizer.#VALUE);
            return this.expression(
              node.right,
              scope,
              v1,
            ).map(
              (v2) =>
                v2.insert(
                  Optimizer.#WORLD,
                  this.store.value(node.token, [
                    ValueType.SetField,
                    v2.select(Optimizer.#WORLD),
                    x,
                    field,
                    v2.select(Optimizer.#VALUE),
                  ]),
                ),
            );
          },
        );
      }
      case TokenType.IDENTIFIER: {
        const { name } = node.left as Variable;
        if (!scope.some((it) => it.name === name)) {
          return Optimizer.#error(node.left.token, "Undeclared variable");
        }
        return this.expression(
          node.right,
          scope,
          values,
        ).map(
          (values) => values.insert(name, values.select(Optimizer.#VALUE)),
        );
      }
      case TokenType.VAR: {
        const varDecl = node.left as VarDeclaration;
        const { name } = varDecl.key;
        const other = scope.find((it) => it.name === name);
        if (other !== undefined) {
          return Optimizer.#error(
            node.left.token,
            `Variable already declared at (${other.token.line},${other.token.column})`,
          );
        }
        scope.push(varDecl.key);
        return this.expression(
          node.right,
          scope,
          values,
        ).map(
          (values) => values.insert(name, values.select(Optimizer.#VALUE)),
        );
      }
      default:
        return Optimizer.#error(node.token, "Impossible assignment");
    }
  }

  // there is no such thing
  simpleExpression(
    node: Expression,
    scope: Variable[],
    values: SplayMap<Value>,
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
        if (!scope.some((it) => it.name === name)) {
          return "Undeclared variable";
        }
        const value = values.select(name);
        if (value === undefined) {
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
          values.select(Optimizer.#VALUE),
        ]);
      // case TokenType.THIS:
      case TokenType.VAR: {
        const varDecl = node as VarDeclaration;
        const { name } = varDecl.key;
        const other = scope.find((it) => it.name === name);
        if (other !== undefined) {
          return `Variable already declared at`;
        }
        scope.push(varDecl.key);
        return undefined;
      }
      default:
        return "expression expected";
    }
  }

  bool(
    token: Token,
    value: boolean,
    values: SplayMap<Value>,
  ): CPS<SplayMap<Value>> {
    return CPS.eta(
      values.insert(
        Optimizer.#VALUE,
        this.store.literal(token, value),
      ),
    );
  }

  expression(
    node: Expression,
    scope: Variable[],
    values: SplayMap<Value>,
  ): CPS<SplayMap<Value>> {
    switch (node.token.type) {
      case TokenType.AND: {
        const { left, right } = node as Binary;
        return this.ifThenElse(
          left,
          scope,
          values,
        ).mu((l) =>
          l.on
            ? this.expression(right, scope, l.values)
            : this.bool(left.token, false, l.values)
        );
      }
      case TokenType.BE:
        return this.assign(node as Binary, scope, values);
      case TokenType.DOT: {
        const { object, field } = node as Access;
        return this.expression(object, scope, values).map((values) => {
          const dot = this.store.value(
            node.token,
            [
              ValueType.GetField,
              values.select(Optimizer.#WORLD),
              values.select(Optimizer.#VALUE),
              field,
            ],
          );
          return values.insert(Optimizer.#VALUE, dot);
        });
      }
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE: {
        const { token, left, right } = node as Binary;
        return this.expression(left, scope, values).mu((v) =>
          this.expression(right, scope, v).map((w) =>
            // todo: constant propagation
            w.insert(
              Optimizer.#VALUE,
              this.store.value(token, [
                ValueType.Comparison,
                v.select(Optimizer.#VALUE),
                node.token.type,
                w.select(Optimizer.#VALUE),
              ]),
            )
          )
        );
      }
      case TokenType.LOG: {
        const { token, value } = node as Log;
        return this.expression(value, scope, values).map((values) =>
          values.insert(
            Optimizer.#WORLD,
            this.store.value(token, [
              ValueType.Log,
              values.select(Optimizer.#WORLD),
              values.select(Optimizer.#VALUE),
            ]),
          )
        );
      }
      case TokenType.OR: {
        const { left, right } = node as Binary;
        return this.ifThenElse(left, scope, values).mu((l) =>
          l.on
            ? this.bool(left.token, true, l.values)
            : this.expression(right, scope, l.values)
        );
      }
      case TokenType.PAREN_LEFT: {
        const { token, operator, operands } = node as Call;
        return this.expression(operator, scope, values).mu((v) => {
          const f: ValueQ = v.select(Optimizer.#VALUE);
          if (operands.length === 0) {
            const y = this.store.value(token, [
              ValueType.Call,
              v.select(Optimizer.#WORLD) as ValueQ,
              f,
            ]);
            return CPS.eta(
              v.insert(Optimizer.#VALUE, y).insert(Optimizer.#WORLD, y),
            );
          }
          const x: ValueQ[] = [];
          let a = this.expression(operands[0], scope, v).map((v) => {
            x[0] = v.select(Optimizer.#VALUE);
            return v;
          });
          for (let i = 1; i < operands.length; i++) {
            a = a.mu((v) =>
              this.expression(operands[i], scope, v).map((v) => {
                x[i] = v.select(Optimizer.#VALUE);
                return v;
              })
            );
          }
          return a.map((w) => {
            const y = this.store.value(token, [
              ValueType.Call,
              w.select(Optimizer.#WORLD) as ValueQ,
              f,
              ...x,
            ]);
            return w.insert(Optimizer.#VALUE, y).insert(Optimizer.#WORLD, y);
          });
        });
      }
      default: {
        const v = this.simpleExpression(node, scope, values);
        if (typeof v === "string") {
          return Optimizer.#error(node.token, v);
        }
        return CPS.eta(
          values.insert(Optimizer.#VALUE, v),
        );
      }
    }
  }

  _jump(
    token: Token,
    jump: Jump | undefined,
    scope: Variable[],
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    if (!jump) {
      return CPS.eta({ target: Optimizer.#NEXT, values });
    }
    switch (jump.token.type) {
      case TokenType.BREAK: {
        const { label } = jump as Break;
        return CPS.eta({
          target: label ? `<break ${label}>` : "<break>",
          values,
        });
      }
      case TokenType.CONTINUE: {
        const { label } = jump as Continue;
        return CPS.eta({
          target: label ? `<continue ${label}>` : "<continue>",
          values,
        });
      }
      case TokenType.RETURN: {
        const { expression } = jump as Return;
        if (expression) {
          return new CPS((_) =>
            this.expression(expression, scope, values).complete((values) => [
              LabelType.RETURN,
              values.select(Optimizer.#WORLD),
              values.select(Optimizer.#VALUE),
            ])
          );
        } else {
          return new CPS((_) => [
            LabelType.RETURN,
            values.select(Optimizer.#WORLD),
            undefined,
          ]);
        }
      }
    }
    return Optimizer.#error(token, "nowhere to go from here");
  }

  statements(
    statements: Statement[],
    scope: Variable[],
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    if (statements.length === 0) {
      return CPS.eta({ target: Optimizer.#NEXT, values });
    }
    let y = this.statement(statements[0], scope, values);
    for (let i = 1; i < statements.length; i++) {
      y = y.mu((goto) => {
        if (goto.target === Optimizer.#NEXT) {
          return this.statement(statements[i], scope, goto.values);
        }
        return CPS.eta(goto);
      });
    }
    return y;
  }

  block(
    block: Block,
    scope: Variable[],
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    const scopeDepth = scope.length;
    const cps = this.statements(block.statements, scope, values).mu((goto) => {
      if (goto.target === Optimizer.#NEXT) {
        return this._jump(block.token, block.jump, scope, goto.values);
      }
      scope.length = scopeDepth;
      return CPS.eta(goto);
    });
    return cps;
  }

  ifThenElse(
    condition: Expression,
    scope: Variable[],
    values: SplayMap<Value>,
  ): CPS<{ on: boolean; values: SplayMap<Value> }> {
    switch (condition.token.type) {
      case TokenType.AND: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(
          left,
          scope,
          values,
        ).mu((l) =>
          l.on ? this.ifThenElse(right, scope, l.values) : CPS.eta(l)
        );
      }
      case TokenType.BE: {
        const { token, left, right } = condition as Binary;
        return this.ifThenElse(
          right,
          scope,
          values,
        ).mu((r) =>
          this.assign(
            new Binary(token, left, new Literal(token, r.on)),
            scope,
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
          scope,
          values,
        ).mu((v) =>
          this.expression(
            new Log(token, new Literal(token, v.on)),
            scope,
            v.values,
          ).map((w) => ({ on: v.on, values: w }))
        );
      }
      case TokenType.NOT: {
        const { expression } = condition as Not;
        return this.ifThenElse(expression, scope, values).map((
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
          scope,
          values,
        ).mu((l) => {
          if (l.on) return CPS.eta(l);
          return this.ifThenElse(right, scope, l.values);
        });
      }
      case TokenType.TRUE:
        return CPS.eta({ on: false, values });
      default:
        return this.expression(condition, scope, values).mu(
          (v: SplayMap<Value>) => {
            const c = v.select(Optimizer.#VALUE);
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

  #phonies(scope: Variable[]) {
    let phonies = SplayMap.empty<Value>();
    for (const it of scope) {
      phonies = phonies.insert<Value>(
        it.name,
        this.store.value(it.token, [ValueType.Phi, it.name]),
      );
    }
    return phonies;
  }

  statement(
    node: Statement,
    scope: Variable[],
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    // jump target
    switch (node.token.type) {
      case TokenType.BRACE_LEFT: {
        return this.block(node as Block, scope, values);
      }
      case TokenType.IF: {
        const { condition, onTrue, onFalse } = node as IfStatement;
        return this.ifThenElse(condition, scope, values).mu((it) => {
          if (it.on) return this.block(onTrue, scope, it.values);
          if (onFalse) return this.block(onFalse, scope, it.values);
          return Optimizer.#next(it.values);
        });
      }
      case TokenType.WHILE: {
        const { condition, onTrue, label } = node as WhileStatement;
        const _label = label ||
          ["WHILE", node.token.line, node.token.column].join("_");
        // this is where the phonies seem necessary
        const head: CPS<{
          target: string;
          values: SplayMap<Value>;
        }> = this.ifThenElse(condition, scope, this.#phonies(scope)).mu(
          (it) => {
            if (!it.on) return Optimizer.#next(it.values);
            return this.block(onTrue, scope, it.values).mu((goto) => {
              if (
                goto.target === Optimizer.#NEXT ||
                goto.target === "<continue>" ||
                (label && goto.target === `<continue ${label}>`)
              ) {
                return new CPS((_) => [LabelType.GOTO, _label, goto.values]);
              }
              if (
                goto.target === "<break>" ||
                (label && goto.target === `<break ${label}>`)
              ) {
                return Optimizer.#next(goto.values);
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
        return this.expression(node as Expression, scope, values).map((
          values,
        ) => ({
          target: Optimizer.#NEXT,
          values,
        }));
    }
  }

  static #next(values: SplayMap<Value>): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    return CPS.eta({ target: Optimizer.#NEXT, values });
  }
}
