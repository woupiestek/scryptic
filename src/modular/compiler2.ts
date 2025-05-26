import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Frames, Op, Parser } from "./yap.ts";
import { Table } from "../collections/table.ts";
import { cyrb53 } from "./cyrb53.ts";

enum Jump {
  Goto,
  If,
  Return,
}

export class Compiler {
  #automaton: Automaton = new Automaton();
  #frames: Frames = new Frames();
  #parser: Parser = new Parser(this.#frames);
  #labels: Labels = new Labels();
  #stmts: Statements = new Statements();
  #exprs: Expressions = new Expressions();

  constructor(
    private readonly source: string,
  ) {
    this.#automaton.readString(source);
    this.#parser.visitAll(this.#automaton.types);
    const x = [...this.#frames.closed()];
    if (x.length) {
      this.#statement(
        x[0],
        this.#stmts.alloc(),
        this.#maybeStatements(x[1], -1),
      );
    }
  }

  #type(id: number) {
    return this.#automaton.types[this.#frames.token(id)];
  }

  #index(id: number) {
    return this.#automaton.indices[this.#frames.token(id)];
  }

  #children(id: number) {
    return this.#frames.children(id);
  }

  #firstChild(id: number) {
    return this.#frames.children(id)[0];
  }

  #op(source: number, op: Op) {
    const op2 = this.#frames.op(source);
    assert(op2 === op, `${Op[op2]} !== ${Op[op]}`);
  }

  #statements(source: number, target: number, nextId: number) {
    this.#op(source, Op.Stmts);
    const c = this.#children(source);
    if (c.length === 0) {
      this.#stmts.set(target, -1, Jump.Goto, nextId);
      return;
    }
    const [h, t] = c;
    this.#statement(
      h,
      target,
      this.#maybeStatements(t, nextId),
    );
  }

  #maybeStatements(source: number, nextId: number) {
    this.#op(source, Op.Stmts);
    const c = this.#children(source);
    if (c.length === 0) {
      return nextId;
    }
    const [h, t] = c;
    const target = this.#stmts.alloc();
    this.#statement(
      h,
      target,
      this.#maybeStatements(t, nextId),
    );
    return target;
  }

  #matchType(id: number, ...types: TokenType[]) {
    return types.includes(this.#type(id));
  }

  #labelOrIdentifier(id: number) {
    if (!this.#matchType(id, TokenType.IDENTIFIER, TokenType.LABEL)) {
      return undefined;
    }
    const from = this.#index(id);
    let to = from;
    while (to < this.source.length && /[0-9A-Za-z]/.test(this.source[++to]));
    return this.source.slice(from, to);
  }

  #statement(source: number, target: number, nextId: number) {
    this.#op(source, Op.Stmt);
    switch (this.#type(source)) {
      case TokenType.BRACE_LEFT:
        this.#statements(
          this.#firstChild(this.#firstChild(source)),
          target,
          nextId,
        );
        return;
      case TokenType.BREAK: {
        const children = this.#children(source);
        this.#stmts.set(
          target,
          -1,
          Jump.Goto,
          children.length
            ? this.#labels.breakTo(this.#labelOrIdentifier(children[0]))
            : this.#labels.breakAt(),
        );
        return;
      }
      case TokenType.CONTINUE: {
        const children = this.#children(source);
        this.#stmts.set(
          target,
          -1,
          Jump.Goto,
          children.length
            ? this.#labels.continueTo(this.#labelOrIdentifier(children[0]))
            : this.#labels.continueAt(),
        );
        return;
      }
      case TokenType.IF: {
        const [i, t, e] = this.#children(source);
        const a = this.#maybeStatements(this.#firstChild(t), nextId);
        let b = nextId;
        const f = this.#firstChild(e);
        if (f !== undefined) {
          b = this.#maybeStatements(this.#firstChild(f), nextId);
        }
        this.#stmts.set(target, this.#expr(i), Jump.If, a, b);
        return;
      }
      case TokenType.LABEL: {
        const label = this.#labelOrIdentifier(source);
        const [c, b] = this.#children(source);
        const id = this.#stmts.alloc();
        this.#labels.push(label, nextId, target);
        this.#statements(
          this.#firstChild(b),
          id,
          target,
        );
        this.#labels.pop();
        this.#stmts.set(target, this.#expr(c), Jump.If, id, nextId);
        return;
      }
      case TokenType.RETURN:
        this.#stmts.set(
          target,
          this.#expr(this.#firstChild(source)) ?? -1,
          Jump.Return,
        );
        return;
      case TokenType.WHILE: {
        const label = this.#labelOrIdentifier(source);
        const [c, b] = this.#children(source);
        this.#labels.push(label, nextId, target);
        const id = this.#maybeStatements(
          this.#firstChild(b),
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
          this.#expr(this.#firstChild(source)),
          Jump.Goto,
          nextId,
        );
        return;
    }
  }

  #name(id: number) {
    const name = this.#labelOrIdentifier(id);
    assert(name !== undefined);
    return this.#exprs.addName(name);
  }

  #exprHead(id: number): number {
    this.#op(id, Op.ExprHead);
    const type = this.#type(id);
    const child = this.#firstChild(id);
    if (type === TokenType.VAR) {
      return this.#exprs.store(-1, type, this.#name(child));
    }
    if (type === TokenType.IDENTIFIER) {
      return this.#exprs.store(-1, type, this.#name(id));
    }
    if (type === TokenType.PAREN_LEFT) {
      return this.#expr(child);
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
      child === undefined ? this.#index(id) : this.#exprHead(child),
    );
  }

  #expr(source: number): number {
    this.#op(source, Op.Expr);
    const [h, t] = this.#children(source);
    const left = this.#exprHead(h);
    const child = t === undefined ? undefined : this.#firstChild(t);
    if (child === undefined) return left;
    const typeT = this.#type(t);
    if (typeT === TokenType.PAREN_LEFT) {
      return this.#exprs.store(
        left,
        typeT,
        this.#exprs.storeArray(
          (this.#children(child)).map((child) => this.#expr(child)),
        ),
      );
    }
    if (typeT === TokenType.DOT) {
      return this.#exprs.store(left, typeT, this.#name(child));
    }
    return this.#exprs.store(left, typeT, this.#expr(child));
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
