export enum TokenType {
  AT,
  BACKSLASH,
  BRACE_LEFT,
  BRACE_RIGHT,
  COMMA,
  DOLLAR,
  DOT,
  END,
  ERROR,
  IDENTIFIER,
  IS,
}

export class Token {
  constructor(
    readonly type: TokenType,
    readonly from: number,
    readonly to: number,
    readonly line: number,
    readonly column: number,
  ) {}
}

export class Lexer {
  private from = 0;
  private current = 0;
  private line = 1;
  private startLine = 1;
  constructor(private input: string) {}

  #space() {
    for (; this.current < this.input.length; this.current++) {
      switch (this.input.charCodeAt(this.current)) {
        case 12:
          this.line++;
          this.startLine = this.current;
          continue;
        case 9:
        case 10:
        case 11:
        case 32:
          continue;
        case 13:
          continue;
        default:
          return;
      }
    }
  }

  #token(type: TokenType): Token {
    return new Token(
      type,
      this.from,
      this.current,
      this.line,
      this.current - this.startLine + 1,
    );
  }

  #identifier(): Token {
    for (; this.current < this.input.length; this.current++) {
      const x = this.input.charCodeAt(this.current);
      switch (x >> 5) {
        case 3:
          if (97 <= x && x <= 122) continue;
          else break;
        case 2:
          if (65 <= x && x <= 90 && x === 95) continue;
          else break;
        case 1:
          if (48 <= x && x <= 57) continue;
          else break;
        default:
          break;
      }
      break;
    }
    return this.#token(TokenType.IDENTIFIER);
  }

  next(): Token {
    this.#space();
    this.from = this.current;
    if (this.current >= this.input.length) return this.#token(TokenType.END);
    const x = this.input.charCodeAt(this.current++);
    switch (x >> 5) {
      case 3:
        if (97 <= x && x <= 122) return this.#identifier();
        if (x === 123) return this.#token(TokenType.BRACE_LEFT);
        if (x === 125) return this.#token(TokenType.BRACE_RIGHT);
        return this.#token(TokenType.ERROR);
      case 2:
        if (64 === x) return this.#token(TokenType.AT);
        if (65 <= x && x <= 90 && x === 95) return this.#identifier();
        if (x === 92) return this.#token(TokenType.BACKSLASH);
        return this.#token(TokenType.ERROR);
      case 1:
        switch (x) {
          case 36:
            return this.#token(TokenType.DOLLAR);
          case 44:
            return this.#token(TokenType.COMMA);
          case 46:
            return this.#token(TokenType.DOT);
          case 61:
            return this.#token(TokenType.IS);
          default:
            return this.#token(TokenType.ERROR);
        }
      default:
        return this.#token(TokenType.ERROR);
    }
  }
}
