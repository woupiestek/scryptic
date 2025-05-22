import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Frames, Op, Parser } from "./yap.ts";

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

  constructor(
    private readonly source: string,
  ) {
    this.#automaton.readString(source);
    this.#parser.visitAll(this.#automaton.types);
    const x = [...this.#frames.closed()];
    if (x.length) {
      this.#statement(
        x[0],
        this.#id++,
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
    assert(this.#frames.op(source) === op);
  }

  #statements(source: number, target: number, nextId: number) {
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
    const target = this.#id++;
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
        this.#set(
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
        this.#set(
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
        this.#set(target, i, Jump.If, a, b);
        return;
      }
      case TokenType.LABEL: {
        const label = this.#label(source);
        const [c, b] = this.#children(source);
        const id = this.#id++;
        this.#labels.push(label, nextId, target);
        this.#statements(
          this.#firstChild(b),
          id,
          target,
        );
        this.#labels.pop();
        this.#set(target, c, Jump.If, id, nextId);
        return;
      }
      case TokenType.RETURN:
        this.#set(target, this.#firstChild(source) ?? -1, Jump.Return);
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
    this.#top--;
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
