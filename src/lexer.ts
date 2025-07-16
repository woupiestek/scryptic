export enum TokenType {
  AND,
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

export class Lexer {
  private from = 0;
  private current = 0;
  readonly types: TokenType[] = [];
  readonly indices: number[] = [];
  constructor(private input: string) {
    while (this.current < this.input.length) {
      this.#next();
    }
  }

  lineAndColumn(token: number) {
    let line = 1;
    let column = 1;
    for (let i = 0; i < this.indices[token]; i++) {
      if (this.input[i] === "\n") {
        column = 1;
        line++;
      } else if (
        this.input[i] !== "\r"
      ) {
        column++;
      }
    }
    return { line, column };
  }

  lexeme(token: number) {
    return this.input.slice(this.indices[token], this.indices[token + 1])
      .trim();
  }

  #space() {
    for (; this.current < this.input.length; this.current++) {
      switch (this.input.charCodeAt(this.current)) {
        case 12:
        case 9:
        case 10:
        case 11:
        case 32:
        case 13:
          continue;
        default:
          return;
      }
    }
  }

  #token(type: TokenType): void {
    this.types.push(type);
    this.indices.push(this.from);
  }

  #identifier(): void {
    for (; this.current < this.input.length; this.current++) {
      const x = this.input.charCodeAt(this.current);
      switch (x >> 5) {
        case 3:
          if (97 <= x && x <= 122) continue;
          else break;
        case 2:
          if ((65 <= x && x <= 90) || x === 95) continue;
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

  #next(): void {
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
          case 38:
            return this.#token(TokenType.AND);
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
