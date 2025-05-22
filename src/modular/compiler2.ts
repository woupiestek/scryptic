import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Frames, Op, Parser } from "./yap.ts";
import { NatSet } from "../collections/natset.ts";

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
    assert(this.#frames.op(source) === op);
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

  #label(id: number) {
    if (
      this.#type(id) !== TokenType.LABEL
    ) return undefined;
    const from = this.#index(id);
    let to = from;
    while (/[0-9A-Za-z]/.test(this.source[++to]));
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
            ? this.#labels.breakTo(this.#label(children[0]))
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
            ? this.#labels.continueTo(this.#label(children[0]))
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
        const label = this.#label(source);
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
        const label = this.#label(source);
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

  #exprHead(id: number): number {
    this.#op(id, Op.ExprHead);
    const type = this.#type(id);
    const children = this.#children(id);
    if (type === TokenType.VAR) {
      return this.#exprs.store(
        -1,
        type,
        this.#index(children[0]),
      );
    }

    if (type === TokenType.PAREN_LEFT) {
      return this.#expr(children[0]);
    }

    return this.#exprs.store(
      -1,
      type,
      children.length ? this.#exprHead(children[0]) : this.#index(id),
    );
  }

  #expr(source: number): number {
    this.#op(source, Op.Expr);
    const [h, t] = this.#children(source);
    const left = this.#exprHead(h);
    const children = t === undefined ? undefined : this.#children(t);
    const typeT = this.#type(t);
    if (!children?.length) return left;
    if (typeT === TokenType.PAREN_LEFT) {
      return this.#exprs.store(
        left,
        typeT,
        this.#exprs.storeArray(
          (this.#children(children[0])).map((child) => this.#expr(child)),
        ),
      );
    }
    if (typeT === TokenType.DOT) {
      return this.#exprs.store(left, typeT, this.#index(children[0]));
    }

    return this.#exprs.store(left, typeT, this.#expr(children[0]));
  }

  show() {
    const result: string[] = [];
    for (let i = 0, l = this.#stmts.size(); i < l; i++) {
      result.push(this.#stmts.show(i, this.#exprs));
    }
    return result.map((x, i) => `${i}: ${x}`).join("\n");
  }
}

// keep in context
// truncate after leaving a scope...
// it is not the same thing as dealing with the jumps!
// the scopes are another concern.
class Identifiers {
  #top = -1;
  #keys: string[] = [];
  #values: number[] = [];
  #declared = new NatSet();

  declare(key: string, value: number = -1): void {
    this.#keys[++this.#top] = key;
    this.#values[this.#top] = value;
    this.#declared.add(this.#top);
  }

  // what will this be used for?
  pop() {
    if (this.#top > 0) this.#top--;
  }

  get(key: string): number {
    for (let id = this.#top; id >= 0; id--) {
      if (this.#keys[id] === key) return this.#values[id];
    }
    this.#keys[++this.#top] = key;
    this.#values[this.#top] = -1;
    // isn't this going to hurt later?
    return -1;
  }

  assign(key: string, value: number): boolean {
    for (let id = this.#top; id >= 0; id--) {
      if (this.#keys[id] === key) {
        this.#values[id] = value;
        return this.#declared.has(id);
      }
    }
    this.#keys[++this.#top] = key;
    this.#values[this.#top] = value;
    return this.#declared.has(this.#top);
  }
}

class Expressions {
  #top = -1;
  #lefts: number[] = [];
  #operators: number[] = [];
  #rights: number[] = [];

  #arrays: number[][] = [];

  storeArray(array: number[]) {
    return this.#arrays.push(array) - 1;
  }

  store(left: number, operator: TokenType, right: number = -1): number {
    this.#lefts[++this.#top] = left;
    this.#operators[this.#top] = operator;
    this.#rights[this.#top] = right;
    return this.#top;
  }

  show(i: number): string {
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
        if (left < 0) {
          if (right < 0) {
            return opstr;
          }
          return `(${opstr} ${this.show(right)})`;
        }
        return `(${this.show(left)} ${opstr} ${this.show(right)})`;
      case TokenType.IDENTIFIER:
      case TokenType.STRING:
      case TokenType.VAR:
      case TokenType.DOT:
        return `(${opstr} ${right})`;
      case TokenType.PAREN_LEFT:
        return `(${this.show(left)} ${
          this.#arrays[right].map((j) => this.show(j)).join(" ")
        })`;
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

  show(i: number, exprs: Expressions) {
    const e = exprs.show(this.expr(i));
    switch (this.jump(i)) {
      case Jump.Goto:
        return `${e}; goto ${this.args(i)[0]}`;
      case Jump.If:
        return `if ${e} ${this.args(i).join(" ")}`;
      case Jump.Return:
        return `return ${e}`;
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
