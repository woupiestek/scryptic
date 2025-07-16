import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Table } from "../collections/table.ts";
import { cyrb53 } from "./cyrb53.ts";
import { Parse } from "../assembly/parse.ts";
import { TokenType } from "../assembly/lex.ts";

enum Jump {
  Goto,
  If,
  Return,
}

export class Compiler {
  #labels: Labels = new Labels();
  #stmts: Statements = new Statements();
  #exprs: Expressions = new Expressions();

  constructor(
    readonly parse: Parse,
  ) {
    this.#maybeStatements(parse.children(), -1);
  }

  #type(id: number) {
    return this.parse.lex.types[this.parse.tokens[id]];
  }

  #index(id: number) {
    return this.parse.lex.types[this.parse.tokens[id]];
  }

  #children(id: number) {
    return this.parse.children(id);
  }

  #statements(source: number[], target: number, nextId: number) {
    while (source.length > 1) {
      const n2 = this.#stmts.alloc();
      this.#statement(source.pop() as number, n2, nextId);
      nextId = n2;
    }
    this.#statement(source.pop() as number, target, nextId);
  }

  #maybeStatements(source: number[], nextId: number) {
    while (source.length > 0) {
      const n2 = this.#stmts.alloc();
      this.#statement(source.pop() as number, n2, nextId);
      nextId = n2;
    }
    return nextId;
  }

  #lexeme(id: number) {
    return this.parse.lex.lexeme(this.parse.tokens[id]);
  }

  #isLeaf(node: number) {
    return this.parse.sizes[node] === 1;
  }

  #statement(source: number, target: number, nextId: number) {
    switch (this.#type(source)) {
      case TokenType.BRACE_LEFT:
        this.#statements(
          this.#children(source),
          target,
          nextId,
        );
        return;
      case TokenType.BREAK:
        this.#stmts.set(
          target,
          -1,
          Jump.Goto,
          this.#isLeaf(source)
            ? this.#labels.breakAt()
            : this.#labels.breakTo(this.#lexeme(source - 1)),
        );
        return;
      case TokenType.CONTINUE: {
        this.#stmts.set(
          target,
          -1,
          Jump.Goto,
          this.#isLeaf(source)
            ? this.#labels.continueAt()
            : this.#labels.continueTo(this.#lexeme(source - 1)),
        );
        return;
      }
      case TokenType.IF: {
        const children = this.#children(source);
        const [i, t, e] = children;
        const a = this.#maybeStatements(this.#children(t), nextId);
        let b = nextId;
        if (!this.#isLeaf(e)) {
          b = this.#maybeStatements(this.#children(t), nextId);
        }
        this.#stmts.set(target, this.#expr(i), Jump.If, a, b);
        return;
      }
      case TokenType.RETURN:
        this.#stmts.set(
          target,
          this.#isLeaf(source) ? this.#expr(source - 1) : -1,
          Jump.Return,
        );
        return;
      case TokenType.WHILE: {
        const a = this.#children(source);
        const b = a.pop() as number;
        const c = a.pop() as number;
        const label = a.pop();
        this.#labels.push(this.#lexeme(label ?? source), nextId, target);
        const id = this.#maybeStatements(
          this.#children(b),
          target,
        );
        this.#labels.pop();
        this.#stmts.set(target, this.#expr(c), Jump.If, id, nextId);
        return;
      }
      case TokenType.SEMICOLON:
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
        this.#stmts.set(target, -1, Jump.Return);
        return;
      default:
        this.#stmts.set(
          target,
          this.#expr(source - 1),
          Jump.Goto,
          nextId,
        );
        return;
    }
  }

  #name(id: number) {
    assert(new Set([
      TokenType.IDENTIFIER,
      TokenType.LABEL,
    ]).has(this.#type(id)));
    return this.#exprs.addName(this.#lexeme(id));
  }

  #exprHead(id: number): number {
    assert(id >= 0);
    const type = this.#type(id);
    if (type === TokenType.VAR) {
      return this.#exprs.store(-1, type, this.#name(id - 1));
    }
    if (type === TokenType.IDENTIFIER) {
      return this.#exprs.store(-1, type, this.#name(id));
    }
    if (type === TokenType.PAREN_LEFT) {
      return this.#expr(id - 1);
    }
    if (
      type === TokenType.FALSE || type === TokenType.THIS ||
      type === TokenType.TRUE
    ) {
      return this.#exprs.store(-1, type, -1);
    }
    return this.#exprs.store(
      -1,
      type,
      this.#isLeaf(id) ? this.#index(id) : this.#exprHead(id - 1),
    );
  }

  #args(sources: number[]): number {
    return this.#exprs.storeArray(sources.map((source) => this.#expr(source)));
  }

  #expr(source: number): number {
    const children = this.#children(source);
    switch (children.length) {
      case 0:
      case 1:
        return this.#exprHead(source);
      default:
        break;
    }
    const typeT = this.#type(source);
    if (typeT === TokenType.PAREN_LEFT) {
      const [f, ...xs] = children;
      return this.#exprs.store(
        this.#exprHead(f),
        typeT,
        this.#args(xs),
      );
    }
    const [l, r] = children;
    if (typeT === TokenType.DOT) {
      return this.#exprs.store(this.#exprHead(l), typeT, this.#name(r));
    }
    return this.#exprs.store(this.#exprHead(l), typeT, this.#expr(r));
  }

  show() {
    const result: string[] = ["Expressions:"];
    for (let i = 0, l = this.#exprs.size(); i < l; i++) {
      result.push(`${i}: ${this.#exprs.show(i)}`);
    }
    result.push("Statements:");
    for (let i = 0, l = this.#stmts.size(); i < l; i++) {
      result.push(`${i}: ${this.#stmts.show(i)}`);
    }
    return result.join("\n");
  }
}

class Expressions {
  #top = -1;
  #lefts: number[] = [];
  #operators: number[] = [];
  #rights: number[] = [];
  #arrays: number[][] = [];
  #identifiers = new Table<string>();

  storeArray(array: number[]) {
    return this.#arrays.push(array) - 1;
  }

  addName(name: string) {
    const key = cyrb53(name);
    this.#identifiers.set(key, name);
    return key;
  }

  store(left: number, operator: TokenType, right: number = -1): number {
    this.#lefts[++this.#top] = left;
    this.#operators[this.#top] = operator;
    this.#rights[this.#top] = right;
    return this.#top;
  }

  size() {
    return this.#lefts.length;
  }

  show(i: number): string {
    assert(i < this.#lefts.length);
    if (i < 0) return "null";
    const left = this.#lefts[i];
    const op = this.#operators[i];
    const opstr = TokenType[op];
    const right = this.#rights[i];

    switch (op) {
      case TokenType.AND:
      case TokenType.BE:
      case TokenType.FALSE:
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
      case TokenType.THIS:
      case TokenType.TRUE:
        assert(left < i, opstr + " bad left");
        assert(right < i, opstr + " bad right");
        if (left < 0) {
          if (right < 0) {
            return opstr;
          }
          return `(${opstr} ${right})`;
        }
        return `(${left} ${opstr} ${right})`;
      case TokenType.IDENTIFIER:
      case TokenType.VAR:
        return `(${opstr} ${this.#identifiers.get(right)})`;
      case TokenType.STRING:
        return `(${opstr} ${right})`;
      case TokenType.DOT:
        return `(${left} ${opstr} ${this.#identifiers.get(right)})`;
      case TokenType.PAREN_LEFT:
        return `(${left} ${this.#arrays[right].join(" ")})`;
      default:
        return `(${left} ${opstr} ${right})`;
    }
  }
}

class Statements {
  #size = 0;
  #exprs: number[] = [];
  #jump: Jump[] = [];
  #args: number[][] = [];

  alloc() {
    return this.#size++;
  }

  size() {
    return this.#size;
  }

  set(target: number, expr: number, jump: Jump, ...args: number[]) {
    this.#exprs[target] = expr;
    this.#jump[target] = jump;
    this.#args[target] = args;
  }

  expr(id: number) {
    return this.#exprs[id];
  }
  jump(id: number) {
    return this.#jump[id];
  }
  args(id: number) {
    return this.#args[id];
  }

  show(i: number) {
    switch (this.jump(i)) {
      case Jump.Goto:
        return `${i} then ${this.args(i)[0]}`;
      case Jump.If:
        return `if ${i} then ${this.args(i).join(" else ")}`;
      case Jump.Return:
        return `return ${i}`;
    }
  }
}

class Labels {
  #label: (string | undefined)[] = [];
  #break: number[] = [];
  #continue: number[] = [];
  #top = -1;

  push(
    label: string | undefined,
    bre: number,
    con: number,
  ): void {
    this.#label[++this.#top] = label;
    this.#break[this.#top] = bre;
    this.#continue[this.#top] = con;
  }

  pop() {
    if (this.#top > 0) this.#top--;
  }

  breakAt(): number {
    return this.#break[this.#top];
  }

  breakTo(label: string | undefined): number {
    if (label === undefined) return -1;
    for (let id = this.#top; id >= 0; id--) {
      if (this.#label[id] === label) return this.#break[id];
    }
    return -1;
  }

  continueAt(): number {
    return this.#continue[this.#top];
  }

  continueTo(label: string | undefined): number {
    if (label === undefined) return -1;
    for (let id = this.#top; id >= 0; id--) {
      if (this.#label[id] === label) return this.#continue[id];
    }
    return -1;
  }
}
