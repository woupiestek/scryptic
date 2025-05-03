import { TokenType } from "./lexer.ts";

const PRECEDENCE_A: number[] = [];
PRECEDENCE_A[TokenType.AND] = 2;
PRECEDENCE_A[TokenType.BE] = 1;
PRECEDENCE_A[TokenType.COMMA] = 0;
PRECEDENCE_A[TokenType.DOT] = 4;
PRECEDENCE_A[TokenType.IS_NOT] = 3;
PRECEDENCE_A[TokenType.IS] = 3;
PRECEDENCE_A[TokenType.LESS] = 3;
PRECEDENCE_A[TokenType.MORE] = 3;
PRECEDENCE_A[TokenType.NOT_LESS] = 3;
PRECEDENCE_A[TokenType.NOT_MORE] = 3;
PRECEDENCE_A[TokenType.OR] = 2;
PRECEDENCE_A[TokenType.PAREN_LEFT] = 4;

const PRECEDENCE_B: number[] = [...PRECEDENCE_A];
PRECEDENCE_B[TokenType.BE] = 4;
PRECEDENCE_B[TokenType.PAREN_LEFT] = 0;

enum State {
  Consume,
  ConsumeList,
  MatchBinary,
  MatchIdentifier,
}

export class AttemptPlenty {
  // todo: try the token id plan
  tokenIds: number[] = [];
  precedenceAs: number[] = [];
  // types: TokenType[] = [];
  lhs: number[] = [];
  rhs: number[] = [];

  #tokenId = 0;

  #store(op: TokenType) {
    this.tokenIds.push(this.#tokenId++);
    return this.precedenceAs.push(PRECEDENCE_A[op]) - 1;
  }

  #state = State.Consume;
  #operands: number[] = [];
  #operators: number[] = [];
  #index = 0;

  #pushOps(type: TokenType) {
    this.#operators[this.#index++] = this.#store(type);
    this.#state = State.Consume;
  }

  #parens: number[] = [];
  // only works upto 32 level of nesting...
  #calls = 0;

  visitAll(types: TokenType[]) {
    for (let i = 0, l = types.length; i < l; i++) {
      this.visit(types[i]);
    }
  }

  visit(type: TokenType) {
    // both states can cause collapses
    if (this.#state === State.ConsumeList) {
      if (type === TokenType.PAREN_RIGHT) {
        this.#operands[this.#index] = -1; // push 'empty list'
        this.#collapseOne();
        this.#state = State.MatchBinary;
        return true;
      } else {
        this.#state = State.Consume;
        return this.#consume(type);
      }
    }

    if (this.#state === State.Consume) {
      return this.#consume(type);
    }

    // binary or stop
    switch (type) {
      case TokenType.AND:
      case TokenType.BE: // lhs should be 'assignable'
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR:
        this.#collapse(PRECEDENCE_B[type]);
        this.#pushOps(type);
        return true;
      case TokenType.DOT: // todo: another special case...
      case TokenType.PAREN_LEFT:
        // effectively move the parenthesis before the function
        this.#parens.push(this.#index);
        // this the symbol as binop
        this.#pushOps(type);
        // record that this paren is a function call
        this.#calls = this.#calls << 1 + 1;
        return true;
      // these count as proper ends to expressions...
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
      case TokenType.SEMICOLON:
        if (this.#parens.length) {
          throw new Error(`missing '${")".repeat(this.#parens.length)}'`);
        }
        this.#collapse(0);
        // todo: somehow leave the expression
        return true;
      case TokenType.COMMA:
        if ((this.#calls & 1) === 0) {
          throw new Error("unexpected ','");
        }
        // left the parens on the stack!
        this.#collapse(0, this.#parens[this.#parens.length - 1] - 1);
        this.#pushOps(type);
        return true;
        // whether valid or not depend on the
        // kind the last matched paren_left was
        // now what?
      case TokenType.PAREN_RIGHT:
        if (!this.#parens.length) {
          throw new Error('Unmatched ")"');
        }
        this.#collapse(0, this.#parens.pop());
        this.#calls >> 1;
        return true;
      default:
        throw new Error(`unexpected token ${TokenType[type]}`);
    }
  }

  #collapseOne() {
    const op = this.#operators[this.#index - 1];
    this.lhs[op] = this.#operands[this.#index - 1];
    this.rhs[op] = this.#operands[this.#index];
    this.#operands[--this.#index] = op;
  }

  #collapse(precedence: number, lb = 0) {
    while (
      this.#index > lb && this.precedenceAs[this.#operators[this.#index - 1]] >=
        precedence
    ) {
      this.#collapseOne();
    }
  }

  #consume(type: TokenType) {
    switch (type) {
      case TokenType.FALSE:
      case TokenType.IDENTIFIER:
      case TokenType.STRING:
      case TokenType.THIS:
      case TokenType.TRUE:
        this.#operands[this.#index] = this.#store(type);
        this.#state = State.MatchBinary;
        return true;
      case TokenType.LOG:
      case TokenType.NEW:
      case TokenType.NOT:
      case TokenType.VAR:
        this.#pushOps(type);
        return true;
      case TokenType.PAREN_LEFT:
        this.#parens.push(this.#index);
        // mark parens empty
        this.#calls <<= 1;
        return true;
      default:
        throw new Error("Expression expected");
    }
  }

  #stringify(id: number): string {
    const result = [];
    if (typeof this.lhs[id] === "number") {
      result.push(this.#stringify(this.lhs[id]));
    }
    result.push(this.tokenIds[id].toString());
    if (typeof this.rhs[id] === "number") {
      result.push(this.#stringify(this.rhs[id])); // too soon !?
    }
    return result.length > 1 ? `(${result.join(" ")})` : result[0];
  }

  debug() {
    const parts: string[] = [];
    for (let i = 0; i < this.#index; i++) {
      parts.push(
        "(" + this.#stringify(this.#operands[i]),
        this.#stringify(this.#operators[i]),
      );
    }
    parts.push(
      this.#state === State.Consume
        ? "?"
        : this.#stringify(this.#operands[this.#index]) +
          ")".repeat(this.#index),
    );
    return parts.join(" ");
  }
}
