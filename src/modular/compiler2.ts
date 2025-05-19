import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Op, Parser } from "./yap.ts";

enum Jump {
  Goto,
  If,
  Return,
}

export class Compiler {
  #automaton: Automaton = new Automaton();
  #parser: Parser = new Parser();
  #labels: Labels = new Labels();

  constructor(
    private readonly source: string,
  ) {
    this.#automaton.readString(source);
    this.#parser.visitAll(this.#automaton.types);
    const x = [...this.#parser.frames.closed()];
    if (x.length) {
      this.#statement(
        x[0],
        this.#id++,
        this.#maybeStatements(x[1], -1, -1),
        -1,
      );
    }
  }

  #type(id: number) {
    return this.#automaton.types[this.#parser.frames.token(id)];
  }

  #index(id: number) {
    return this.#automaton.indices[this.#parser.frames.token(id)];
  }

  #children(id: number) {
    return this.#parser.frames.children(id);
  }

  #firstChild(id: number) {
    return this.#parser.frames.children(id)[0];
  }

  #id = 0;
  #exprs: number[] = [];
  #jump: Jump[] = [];
  #args: number[][] = [];

  #set(target: number, expr: number, jump: Jump, ...args: number[]) {
    this.#exprs[target] = expr;
    this.#jump[target] = jump;
    this.#args[target] = args;
  }

  #op(source: number, op: Op) {
    assert(this.#parser.frames.op(source) === op);
  }

  #statements(source: number, target: number, nextId: number, labels: number) {
    this.#op(source, Op.Stmts);
    const c = this.#children(source);
    if (c.length === 0) {
      this.#set(target, -1, Jump.Goto, nextId);
      return;
    }
    const [h, t] = c;
    this.#statement(
      h,
      target,
      this.#maybeStatements(t, nextId, labels),
      labels,
    );
  }

  #maybeStatements(source: number, nextId: number, labels: number) {
    this.#op(source, Op.Stmts);
    const c = this.#children(source);
    if (c.length === 0) {
      return nextId;
    }
    const [h, t] = c;
    const target = this.#id++;
    this.#statement(
      h,
      target,
      this.#maybeStatements(t, nextId, labels),
      labels,
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

  #statement(source: number, target: number, nextId: number, labels: number) {
    this.#op(source, Op.Stmt);
    switch (this.#type(source)) {
      case TokenType.BRACE_LEFT:
        this.#statements(
          this.#firstChild(this.#firstChild(source)),
          target,
          nextId,
          labels,
        );
        return;
      case TokenType.BREAK: {
        const children = this.#children(source);
        this.#set(
          target,
          -1,
          Jump.Goto,
          children.length
            ? this.#labels.breakTo(labels, this.#label(children[0]))
            : this.#labels.breakAt(labels),
        );
        return;
      }
      case TokenType.CONTINUE: {
        const children = this.#children(source);
        this.#set(
          target,
          -1,
          Jump.Goto,
          children.length
            ? this.#labels.continueTo(labels, this.#label(children[0]))
            : this.#labels.continueAt(labels),
        );
        return;
      }
      case TokenType.IF: {
        const [i, t, e] = this.#children(source);
        const a = this.#maybeStatements(this.#firstChild(t), nextId, labels);
        let b = nextId;
        const f = this.#firstChild(e);
        if (f !== undefined) {
          b = this.#maybeStatements(this.#firstChild(f), nextId, labels);
        }
        this.#set(target, i, Jump.If, a, b);
        return;
      }
      case TokenType.LABEL: {
        const label = this.#label(source);
        const [c, b] = this.#children(source);
        const id = this.#id++;
        this.#statements(
          this.#firstChild(b),
          id,
          target,
          this.#labels.cons(label, nextId, target, labels),
        );
        this.#set(target, c, Jump.If, id, nextId);
        return;
      }
      case TokenType.RETURN:
        this.#set(target, this.#firstChild(source) ?? -1, Jump.Return);
        return;
      case TokenType.WHILE: {
        const label = this.#label(source);
        const [c, b] = this.#children(source);
        const id = this.#maybeStatements(
          this.#firstChild(b),
          target,
          this.#labels.cons(label, nextId, target, labels),
        );
        this.#set(target, c, Jump.If, id, nextId);
        return;
      }
      case TokenType.SEMICOLON:
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
        this.#set(target, -1, Jump.Return);
        return;
      default:
        this.#set(target, this.#firstChild(source), Jump.Goto, nextId);
        return;
    }
  }

  show() {
    const result: string[] = [];
    for (let i = 0, l = this.#jump.length; i < l; i++) {
      switch (this.#jump[i]) {
        case Jump.Goto:
          result.push(`${this.#exprs[i]}; goto ${this.#args[i][0]}`);
          continue;
        case Jump.If:
          result.push(`if ${this.#exprs[i]} ${this.#args[i].join(" ")}`);
          continue;
        case Jump.Return:
          result.push(`return ${this.#exprs[i]}`);
      }
    }
    return result.map((x, i) => `${i}: ${x}`).join("\n");
  }
}

class Labels {
  #label: (string | undefined)[] = [];
  #break: number[] = [];
  #continue: number[] = [];
  #tail: number[] = [];
  cons(
    label: string | undefined,
    bre: number,
    con: number,
    tail: number,
  ): number {
    this.#label.push(label);
    this.#break.push(bre);
    this.#continue.push(con);
    return this.#tail.push(tail) - 1;
  }

  breakAt(id: number): number {
    return this.#break[id];
  }

  breakTo(id: number, label: string | undefined): number {
    if (label === undefined) return -1;
    for (; id > 0 && this.#label[id] !== label; id = this.#tail[id]);
    return id > 0 ? this.breakAt(id) : -1;
  }

  continueAt(id: number): number {
    return this.#continue[id];
  }

  continueTo(id: number, label: string | undefined): number {
    if (label === undefined) return -1;
    for (; id > 0 && this.#label[id] !== label; id = this.#tail[id]);
    return id > 0 ? this.continueAt(id) : -1;
  }
}
