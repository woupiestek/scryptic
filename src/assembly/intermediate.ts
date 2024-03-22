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
    return tupleString(...this.data.map((key) => {
      switch (typeof key) {
        case "string":
          return JSON.stringify(key);
        case "number":
          return ValueType[key];
        case "boolean":
        case "undefined":
          return key;
        case "object":
          return (key as Value).toString();
        default:
          throw new Error("Problem node " + key);
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
  key = 1;
  static #reduce(
    key: string | boolean | TokenType | ValueQ | ValueType,
  ): string | number {
    switch (typeof key) {
      case "string":
      case "number":
        return key;
      case "boolean":
        return key ? 0 : 1;
      case "object":
        return (key as Value).key;
      case "undefined":
        return 0;
      default:
        throw new Error("Problem node " + key);
    }
  }
  value(token: Token, data: Data): Value {
    let t = this.trie;
    for (const key of data) {
      t = t.children[Store.#reduce(key)] ||= new Trie();
    }
    return t.value ||= { data, key: this.key++, token };
  }
}

type Label =
  | [GraphType.BLOCK, Label, SplayMap<Value>]
  | [GraphType.IF, Value, Label, Label]
  | [GraphType.RETURN, ValueQ, ValueQ];

class CPS<A> {
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
  scope: VarDeclaration[] = [];
  static #NEXT = "<next>";
  static #VALUE = "<value>";
  static #WORLD = "<world>";

  static #error(token: Token, message: string): Error {
    return new Error(
      `Problem at ${
        TokenType[token.type]
      }(${token.line},${token.column}): '${message}'`,
    );
  }

  assign(
    node: Binary,
    values: SplayMap<Value>,
  ): CPS<SplayMap<Value>> {
    switch (node.left.token.type) {
      case TokenType.DOT: {
        const { object, field } = node.left as Access;
        return this.expression(object, values).mu(
          (v1) => {
            const x = v1.select(Optimizer.#VALUE);
            return this.expression(
              node.right,
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
        if (!this.scope.some((varDecl) => varDecl.key.name === name)) {
          throw Optimizer.#error(node.left.token, "Undeclared variable");
        }
        return this.expression(
          node.right,
          values,
        ).map(
          (values) => values.insert(name, values.select(Optimizer.#VALUE)),
        );
      }
      case TokenType.VAR: {
        const varDecl = node.left as VarDeclaration;
        const { name } = varDecl.key;
        const other = this.scope.find((varDecl) => varDecl.key.name === name);
        if (other !== undefined) {
          throw Optimizer.#error(
            node.left.token,
            `Variable already declared at (${other.token.line},${other.token.column})`,
          );
        }
        this.scope.push(varDecl);
        return this.expression(
          node.right,
          values,
        ).map(
          (values) => values.insert(name, values.select(Optimizer.#VALUE)),
        );
      }
      default:
        throw Optimizer.#error(node.token, "Impossible assignment");
    }
  }

  // there is no such thing
  simpleExpression(node: Expression, values: SplayMap<Value>): ValueQ {
    switch (node.token.type) {
      case TokenType.FALSE:
      case TokenType.STRING:
      case TokenType.TRUE: {
        const { value } = node as Literal;
        return this.store.value(node.token, [ValueType.Literal, value]);
      }
      case TokenType.IDENTIFIER: {
        const { name } = node as Variable;
        if (!this.scope.some((varDecl) => varDecl.key.name === name)) {
          throw Optimizer.#error(node.token, "Undeclared variable");
        }
        const value = values.select(name);
        if (value === undefined) {
          throw Optimizer.#error(node.token, "Unassigned variable");
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
        const other = this.scope.find((varDecl) => varDecl.key.name === name);
        if (other !== undefined) {
          throw Optimizer.#error(
            node.token,
            `Variable already declared at (${other.token.line},${other.token.column})`,
          );
        }
        this.scope.push(varDecl);
        return undefined;
      }
      default:
        throw Optimizer.#error(node.token, "expression expected");
    }
  }

  expression(
    node: Expression,
    values: SplayMap<Value>,
  ): CPS<SplayMap<Value>> {
    switch (node.token.type) {
      case TokenType.AND: {
        const { left, right } = node as Binary;
        return this.ifThenElse(
          left,
          values,
        ).mu((l) =>
          l.on
            ? this.expression(right, l.values)
            : this.expression(new Literal(left.token, false), l.values)
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
        return this.expression(left, values).mu((v) =>
          this.expression(right, v).map((w) =>
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
        return this.expression(value, values).map((values) =>
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
        return this.ifThenElse(left, values).mu((l) =>
          l.on
            ? this.expression(new Literal(left.token, true), l.values)
            : this.expression(right, l.values)
        );
      }
      case TokenType.PAREN_LEFT: {
        const { token, operator, operands } = node as Call;
        return this.expression(operator, values).mu((v) => {
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
          let a = this.expression(operands[0], v).map((v) => {
            x[0] = v.select(Optimizer.#VALUE);
            return v;
          });
          for (let i = 1; i < operands.length; i++) {
            a = a.mu((v) =>
              this.expression(operands[i], v).map((v) => {
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
      default:
        return CPS.eta(
          values.insert(Optimizer.#VALUE, this.simpleExpression(node, values)),
        );
    }
  }

  _jump(
    token: Token,
    jump: Jump | undefined,
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
            this.expression(expression, values).complete((values) => [
              GraphType.RETURN,
              values.select(Optimizer.#WORLD),
              values.select(Optimizer.#VALUE),
            ])
          );
        } else {
          return new CPS((_) => [
            GraphType.RETURN,
            values.select(Optimizer.#WORLD),
            undefined,
          ]);
        }
      }
    }
    throw Optimizer.#error(token, "nowhere to go from here");
  }

  statements(
    statements: Statement[],
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    if (statements.length === 0) {
      return CPS.eta({ target: Optimizer.#NEXT, values });
    }
    let y = this.statement(statements[0], values);
    for (let i = 1; i < statements.length; i++) {
      y = y.mu((goto) => {
        if (goto.target === Optimizer.#NEXT) {
          return this.statement(statements[i], goto.values);
        }
        return CPS.eta(goto);
      });
    }
    return y;
  }

  block(
    block: Block,
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    const scopeDepth = this.scope.length;
    return this.statements(block.statements, values).mu((goto) => {
      this.scope.length = scopeDepth;
      if (goto.target === Optimizer.#NEXT) {
        return this._jump(block.token, block.jump, goto.values);
      }
      return CPS.eta(goto);
    });
  }

  ifThenElse(
    condition: Expression,
    values: SplayMap<Value>,
  ): CPS<{ on: boolean; values: SplayMap<Value> }> {
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
      case TokenType.NOT:
        return this.ifThenElse(condition, values).map(({ on, values }) => ({
          on: !on,
          values,
        }));
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
        return this.expression(condition, values).mu((v: SplayMap<Value>) => {
          const c = v.select(Optimizer.#VALUE);
          if (!c) {
            throw Optimizer.#error(condition.token, "bad condition expression");
          }
          return new CPS((next) => [
            GraphType.IF,
            c,
            next({ on: true, values: v }),
            next({ on: false, values: v }),
          ]);
        });
    }
  }

  #phonies() {
    const phonies = SplayMap.empty<Value>();
    for (const varDecl of this.scope) {
      phonies.insert<Value>(
        varDecl.key.name,
        this.store.value(varDecl.token, [ValueType.Phi, varDecl.key.name]),
      );
    }
    return phonies;
  }

  statement(
    node: Statement,
    // usual issue that this evualates the labels too often!
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
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
          return CPS.eta({
            target: Optimizer.#NEXT,
            values: it.values,
          });
        });
      }
      case TokenType.WHILE: {
        const { condition, onTrue, label } = node as WhileStatement;
        // this is where the phonies seem the most necessary
        const head: CPS<{
          target: string;
          values: SplayMap<Value>;
        }> = this.ifThenElse(condition, this.#phonies()).mu((it) => {
          if (!it.on) return Optimizer.#next(it.values);
          return this.block(onTrue, it.values).mu((goto) => {
            if (
              goto.target === Optimizer.#NEXT || goto.target === "<continue>" ||
              (label && goto.target === `<continue ${label}>`)
            ) {
              return Optimizer.#apply(head, goto.values);
            }
            if (
              goto.target === "<break>" ||
              (label && goto.target === `<break ${label}>`)
            ) {
              return Optimizer.#next(goto.values);
            }
            return CPS.eta(goto);
          });
        });
        return Optimizer.#apply(head, values);
      }
      default:
        return this.expression(node as Expression, values).map((values) => ({
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

  static #apply(
    cps: CPS<{
      target: string;
      values: SplayMap<Value>;
    }>,
    values: SplayMap<Value>,
  ): CPS<{
    target: string;
    values: SplayMap<Value>;
  }> {
    return new CPS(
      (next) => [GraphType.BLOCK, cps.complete(next), values],
    );
  }
}
