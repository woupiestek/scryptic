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
PRECEDENCE_A[TokenType.PAREN_LEFT] = 0;

const PRECEDENCE_B: number[] = [...PRECEDENCE_A];
PRECEDENCE_B[TokenType.BE] = 4;
PRECEDENCE_B[TokenType.PAREN_LEFT] = 4;

enum State {
  Expect,
  ExpectIdentifier,
  AcceptBinary,
}

export class PrattParser {
  tokenIds: number[] = [];
  precedenceAs: number[] = [];
  lhs: number[] = [];
  rhs: number[] = [];

  #tokenId = -1;

  #store(op: TokenType) {
    this.tokenIds.push(this.#tokenId);
    return this.precedenceAs.push(PRECEDENCE_A[op]) - 1;
  }

  #state = State.Expect;
  #tokens: number[] = [];
  #index = -1;

  #push(tokenId: number) {
    this.#tokens[++this.#index] = tokenId;
  }

  #pushOps(type: TokenType) {
    this.#push(this.#store(type));
    this.#state = State.Expect;
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
    this.#tokenId++;
    if (this.#state === State.ExpectIdentifier) {
      if (type === TokenType.IDENTIFIER) {
        this.#push(this.#store(type));
        this.#state = State.AcceptBinary;
        return true;
      } else {
        throw new Error("identifier required");
      }
    }

    if (this.#state === State.Expect) {
      return this.#consume(type);
    }

    // binary or stop
    return this.#matchBinary(type);
  }

  #matchBinary(type: TokenType) {
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
      case TokenType.DOT:
        this.#collapse(PRECEDENCE_B[type]);
        this.#pushOps(type);
        this.#state = State.ExpectIdentifier;
        return true;
      case TokenType.PAREN_LEFT:
        // effectively move the parenthesis before the function
        this.#parens.push(this.#index); // index of the function!
        // treat the symbol as binop
        this.#pushOps(type);
        // record that this paren is a function call
        this.#calls = (this.#calls << 1) + 1;
        return true;
      // these count as proper ends to expressions...
      case TokenType.BRACE_LEFT:
      case TokenType.BRACE_RIGHT:
      case TokenType.END:
      case TokenType.SEMICOLON:
        if (this.#parens.length) {
          throw new Error(`missing '${")".repeat(this.#parens.length)}'`);
        }
        while (this.#index > 0) {
          this.#bindTop();
        }
        // todo: somehow leave the expression
        return true;
      case TokenType.COMMA: {
        if ((this.#calls & 1) === 0) {
          throw new Error("unexpected ','");
        }
        const index = this.#parens[this.#parens.length - 1];
        // left the parens on the stack!
        while (this.#index > index) {
          this.#bindTop();
        }
        this.#pushOps(type);
        return true;
      }
      case TokenType.PAREN_RIGHT: {
        const index = this.#parens.pop();
        if (index === undefined) {
          throw new Error("missing '('");
        } else {
          while (this.#index > index) {
            this.#bindTop();
          }
        }
        this.#calls >> 1;
        return true;
      }
      default:
        throw new Error(`unexpected token ${TokenType[type]}`);
    }
  }

  #bindTop() {
    if (this.#index < 2) throw new Error("Stack underflow");
    const op = this.#tokens[this.#index - 1];
    this.lhs[op] = this.#tokens[this.#index - 2];
    this.rhs[op] = this.#tokens[this.#index];
    this.#index -= 2;
    this.#tokens[this.#index] = op;
  }

  #collapse(precedenceB: number) {
    // don't collapse beyond parentheses
    // remember that these don't form nodes,
    // so they have no place on the stack.
    const lb = this.#parens[this.#parens.length - 1] ?? 0;
    while (
      this.#index > lb && this.precedenceAs[this.#tokens[this.#index - 1]] >=
        precedenceB
    ) {
      this.#bindTop();
    }
  }

  #consume(type: TokenType) {
    switch (type) {
      case TokenType.FALSE:
      case TokenType.IDENTIFIER:
      case TokenType.STRING:
      case TokenType.THIS:
      case TokenType.TRUE:
        this.#push(this.#store(type));
        this.#state = State.AcceptBinary;
        return true;
      case TokenType.LOG:
      case TokenType.NOT:
        this.#push(-1);
        this.#pushOps(type);
        return true;
      case TokenType.NEW:
      case TokenType.VAR:
        this.#push(-1);
        this.#pushOps(type);
        this.#state = State.ExpectIdentifier;
        return true;
      case TokenType.PAREN_LEFT:
        this.#parens.push(this.#index + 1);
        // push zero to mark not function
        this.#calls <<= 1;
        return true;
      case TokenType.PAREN_RIGHT:
        // empty list case
        if ((this.#calls & 1) && this.#parens.pop() === this.#index - 1) {
          this.#calls >> 1;
          this.#push(-1);
          this.#bindTop();
          this.#state = State.AcceptBinary;
          return;
        }
        throw new Error("misplaced ')'");
      default:
        throw new Error(`misplaced ${TokenType[type]}: expression required`);
    }
  }

  #stringify(id: number): string {
    const result = [];
    if (this.lhs[id] >= 0) {
      result.push("(" + this.#stringify(this.lhs[id]) + ")");
    }
    result.push(this.tokenIds[id]?.toString());
    if (this.rhs[id] >= 0) {
      result.push("(" + this.#stringify(this.rhs[id]) + ")");
    }
    return result.join(" ");
  }

  debug() {
    const parts: string[] = [];
    for (let i = 0; i + 1 <= this.#index; i += 2) {
      parts.push(
        `(${this.#stringify(this.#tokens[i])} ${
          this.#stringify(this.#tokens[i + 1])
        }`,
      );
    }
    parts.push(
      this.#state === State.Expect
        ? "?"
        : this.#stringify(this.#tokens[this.#index]) +
          ")".repeat(this.#index),
    );
    return parts.join(" ");
  }
}
