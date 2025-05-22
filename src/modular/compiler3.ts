import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Automaton, TokenType } from "./lexer.ts";
import { Op, Parser } from "./yap.ts";

/**
 *    case Op.Label:
      case Op.Args:
      case Op.Block:
      case Op.BlockEnd:
      case Op.Else:
      case Op.Expr:
      case Op.ExprHead:
      case Op.ExprTail:
      case Op.Identifier:
      case Op.Stmt:
      case Op.Stmts:
 */
export class Compiler {
  #automaton: Automaton = new Automaton();
  #parser: Parser;
  #labels: LabelStack = new LabelStack();

  constructor(private readonly source: string) {
    this.#automaton.readString(source);
    this.#parser = new Parser(this);
    this.#parser.visitAll(this.#automaton.types);
  }

  #label(token: number) {
    return TokenType[this.#automaton.types[token]];
    // assert(this.#automaton.types[token] === TokenType.LABEL);
    // const from = this.#automaton.indices[token];
    // let to = from;
    // while (/[0-9A-Za-z]/.test(this.source[++to]));
    // return this.source.slice(from, to);
  }

  #op: Op[] = [];

  #log: string[] = [];

  push(op: Op, token: number) {
    this.#op.push(op);
    this.#log.push(`<${Op[op]}:${TokenType[this.#automaton.types[token]]}>`);
    switch (op) {
      case Op.Args:
      case Op.ArgsTail:
        return;
      case Op.Block:
      case Op.BlockEnd:
      case Op.Else:
      case Op.Expect:
      case Op.Expr:
      case Op.ExprHead:
      case Op.ExprTail:
      case Op.Identifier:
      case Op.Label: {
        const label = this.#label(token);
        this.#labels.push(label, -1, -1);
        break;
      }
      case Op.ReturnValue:
      case Op.Semicolon:
      case Op.Stmt:
      case Op.Stmts:
    }
  }

  pop(length: number) {
    while (this.#op.length > length) {
      const op = this.#op.pop() ?? -1;
      this.#log.push(`</${Op[op]}>`);
      switch (op) {
        case Op.Args:
        case Op.ArgsTail:
          return;
        case Op.Block:
        case Op.BlockEnd:
        case Op.Else:
        case Op.Expect:
        case Op.Expr:
        case Op.ExprHead:
        case Op.ExprTail:
        case Op.Identifier:
        case Op.Label:
          this.#labels.pop();
          break;
        case Op.ReturnValue:
        case Op.Semicolon:
        case Op.Stmt:
        case Op.Stmts:
      }
    }
  }

  stop() {
    console.log(this.#log.join(""));
  }
}

class LabelStack {
  #label: (string | undefined)[] = [];
  #break: number[] = [];
  #continue: number[] = [];
  #slot = -1;
  push(
    label: string | undefined,
    bre: number,
    con: number,
  ): number {
    this.#label[++this.#slot] = label;
    this.#break[this.#slot] = bre;
    this.#continue[this.#slot] = con;
    return this.#slot;
  }

  pop() {
    assert(this.#slot >= 0);
    this.#slot--;
  }

  breakAt(): number {
    return this.#break[this.#slot];
  }

  breakTo(label: string | undefined): number {
    if (label === undefined) return -1;
    let id = this.#slot;
    for (; id > 0 && this.#label[id] !== label; id--);
    return id > 0 ? this.breakAt() : -1;
  }

  continueAt(): number {
    return this.#continue[this.#slot];
  }

  continueTo(label: string | undefined): number {
    if (label === undefined) return -1;
    let id = this.#slot;
    for (; id > 0 && this.#label[id] !== label; id--);
    return id > 0 ? this.continueAt() : -1;
  }
}

enum Jump {
  Goto,
  If,
  Return,
}

class Statements {
  #id = 0;
  #exprs: number[] = [];
  #jump: Jump[] = [];
  #args: number[][] = [];

  set(target: number, expr: number, jump: Jump, ...args: number[]) {
    this.#exprs[target] = expr;
    this.#jump[target] = jump;
    this.#args[target] = args;
  }

  alloc() {
    return this.#id++;
  }
}
