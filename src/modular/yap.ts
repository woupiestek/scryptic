import { TokenType } from "./lexer.ts";

class Stack {
  #index = -1;
  #instructions: number[] = [];
  isEmpty() {
    return this.#index < 0;
  }
  push(...instructions: number[]) {
    for (
      let instruction = instructions.pop();
      instruction !== undefined;
      instruction = instructions.pop()
    ) {
      this.#instructions[++this.#index] = instruction;
    }
  }
  pop() {
    return this.#instructions[this.#index--];
  }
}

enum Part {
  Accept,
  Binary,
  Else,
  Expect,
  Expression,
  ReturnValue,
  Semicolon,
  StartList,
  Statements,
  TailList,
  Unary,
}

const PRECEDENCE_A: number[] = [];
PRECEDENCE_A[TokenType.AND] = 2;
PRECEDENCE_A[TokenType.BE] = 1;
PRECEDENCE_A[TokenType.DOT] = 4;
PRECEDENCE_A[TokenType.IS_NOT] = 3;
PRECEDENCE_A[TokenType.IS] = 3;
PRECEDENCE_A[TokenType.LESS] = 3;
PRECEDENCE_A[TokenType.MORE] = 3;
PRECEDENCE_A[TokenType.NOT_LESS] = 3;
PRECEDENCE_A[TokenType.NOT_MORE] = 3;
PRECEDENCE_A[TokenType.OR] = 2;
PRECEDENCE_A[TokenType.PAREN_LEFT] = 0;

const PRECEDENCE_B: number[] = [...PRECEDENCE_A];
PRECEDENCE_B[TokenType.BE] = 0;
PRECEDENCE_B[TokenType.PAREN_LEFT] = 4;

export class Parser {
  #stack = new Stack();
  #count = 0;

  constructor() {
    this.#stack.push(Part.Statements, Part.Expect, TokenType.END);
  }

  visitAll(types: TokenType[]) {
    for (const type of types) {
      this.visit(type);
    }
  }

  // could even return events
  visit(type: TokenType) {
    while (!this.#accept(type));
    // why does this do nothing?
    this.#count++;
  }

  #error(message: string) {
    return new Error(`@${this.#count}: ${message}`);
  }

  #accept(type: TokenType) {
    if (this.#stack.isEmpty()) {
      // why this right away?
      throw this.#error("No more tokens can be accepted");
    }
    switch (this.#stack.pop()) {
      case Part.Accept:
        return type === this.#stack.pop();
      case Part.Binary:
        return this.#binary(type, this.#stack.pop());
      case Part.Else:
        if (type === TokenType.ELSE) {
          this.#stack.push(
            Part.Expect,
            TokenType.BRACE_LEFT,
            Part.Statements,
            Part.Expect,
            TokenType.BRACE_RIGHT,
          );
          return true;
        }
        return false;
      case Part.Expect: {
        const operand = this.#stack.pop();
        if (type === operand) return true;
        throw this.#error(
          `${TokenType[operand as TokenType]} expected, ${
            TokenType[type]
          } received`,
        );
      }
      case Part.Expression:
        return this.#expression(type, this.#stack.pop());
      case Part.ReturnValue:
        if (type === TokenType.BRACE_RIGHT) return false;
        return this.#expression(type);
      case Part.Semicolon:
        if (type === TokenType.BRACE_RIGHT || type === TokenType.END) {
          return false;
        }
        if (type === TokenType.SEMICOLON) {
          this.#stack.push(Part.Statements);
          return true;
        }
        throw this.#error(`Expected ";" or "}", received ${TokenType[type]}`);
      case Part.Statements:
        return this.#statements(type);
      case Part.StartList:
        if (type === TokenType.PAREN_RIGHT) return true;
        this.#stack.push(Part.TailList);
        return this.#expression(type);
      case Part.TailList:
        if (type === TokenType.PAREN_RIGHT) return true;
        if (type === TokenType.COMMA) {
          this.#stack.push(Part.Expression, 0, Part.TailList);
          return true;
        }
        throw this.#error(`Expected "," or ")" but found ${TokenType[type]}`);
      case Part.Unary:
        return this.#unary(type);
    }
  }

  #unary(type: TokenType) {
    switch (type) {
      case TokenType.FALSE:
      case TokenType.IDENTIFIER:
      case TokenType.STRING:
      case TokenType.THIS:
      case TokenType.TRUE:
        return true;
      case TokenType.LOG:
      case TokenType.NOT:
      case TokenType.NEW:
        this.#stack.push(Part.Unary);
        return true;
      case TokenType.VAR:
        this.#stack.push(
          Part.Expect,
          TokenType.IDENTIFIER,
        );
        return true;
      case TokenType.PAREN_LEFT:
        this.#stack.push(
          Part.Expression,
          0,
          Part.Expect,
          TokenType.PAREN_RIGHT,
        );
        return true;
      default:
        this.#error("Expression expected");
    }
  }

  #binary(type: TokenType, precedence: number) {
    switch (type) {
      case TokenType.AND:
      case TokenType.BE:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR:
        if (PRECEDENCE_B[type] < precedence) return false;
        this.#stack.push(
          Part.Expression,
          PRECEDENCE_A[type],
          Part.Binary,
          precedence,
        );
        return true;
      case TokenType.DOT:
        this.#stack.push(
          Part.Expect,
          TokenType.IDENTIFIER,
          Part.Binary,
          precedence,
        );
        return true;
      case TokenType.PAREN_LEFT:
        this.#stack.push(Part.StartList, Part.Binary, precedence);
        return true;
      default:
        return false;
    }
  }

  #expression(type: TokenType, precedence: number = 0) {
    this.#stack.push(Part.Binary, precedence);
    return this.#unary(type);
  }

  #statements(type: TokenType) {
    switch (type) {
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
        return false;
      case TokenType.BRACE_LEFT:
        this.#stack.push(
          Part.Statements,
          Part.Expect,
          TokenType.BRACE_RIGHT,
          Part.Statements,
        );
        return true;
      case TokenType.BREAK:
      case TokenType.CONTINUE:
        this.#stack.push(Part.Accept, TokenType.LABEL);
        return true;
      case TokenType.IF:
        this.#stack.push(
          Part.Expression,
          0,
          Part.Expect,
          TokenType.BRACE_LEFT,
          Part.Statements,
          Part.Expect,
          TokenType.BRACE_RIGHT,
          Part.Else,
          Part.Statements,
        );
        return true;
      case TokenType.LABEL:
        this.#stack.push(
          Part.Expect,
          TokenType.WHILE,
          Part.Expression,
          0,
          Part.Expect,
          TokenType.BRACE_LEFT,
          Part.Statements,
          Part.Expect,
          TokenType.BRACE_RIGHT,
          Part.Statements,
        );
        return true;
      case TokenType.RETURN:
        this.#stack.push(Part.ReturnValue);
        return true;
      case TokenType.WHILE:
        this.#stack.push(
          Part.Expression,
          0,
          Part.Expect,
          TokenType.BRACE_LEFT,
          Part.Statements,
          Part.Expect,
          TokenType.BRACE_RIGHT,
          Part.Statements,
        );
        return true;
      default:
        this.#stack.push(Part.Semicolon);
        return this.#expression(type);
    }
  }
}
