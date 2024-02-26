export enum TokenType {
  AND,
  BE,
  BRACE_LEFT,
  BRACE_RIGHT,
  BREAK,
  COLON,
  COMMA,
  CONTINUE,
  DOT,
  ELSE,
  END,
  ERROR,
  FALSE,
  IDENTIFIER,
  IF,
  IS_NOT,
  IS,
  LESS,
  LOG,
  MORE,
  NEW,
  NOT_LESS,
  NOT_MORE,
  NOT,
  OR,
  PAREN_LEFT,
  PAREN_RIGHT,
  SEMICOLON,
  STRING,
  TRUE,
  VAR,
  WHILE,
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

const KEYWORDS: Record<string, TokenType> = {
  break: TokenType.BREAK,
  continue: TokenType.CONTINUE,
  else: TokenType.ELSE,
  false: TokenType.FALSE,
  if: TokenType.IF,
  log: TokenType.LOG,
  new: TokenType.NEW,
  true: TokenType.TRUE,
  var: TokenType.VAR,
  while: TokenType.WHILE,
};

export class Lexer {
  private from = 0;
  private current = 0;
  private line = 1;
  private startLine = 0;
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
    return this.#token(
      KEYWORDS[this.input.substring(this.from, this.current)] ||
        TokenType.IDENTIFIER,
    );
  }

  #string() {
    for (; this.current < this.input.length; this.current++) {
      switch (this.input.charCodeAt(this.current)) {
        case 12:
          break;
        case 34:
          this.current++;
          return this.#token(TokenType.STRING);
        case 92:
          this.current++;
          // take care of new lines here
          if (this.#match(12)) {
            this.line++;
            this.startLine = this.current;
          }
          continue;
      }
    }
    return this.#token(TokenType.ERROR);
  }

  #match(charCode: number) {
    if (this.input.charCodeAt(this.current) === charCode) {
      this.current++;
      return true;
    }
    return false;
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
        if (x === 124) {
          if (this.#match(124)) {
            return this.#token(TokenType.OR);
          }
          return this.#token(TokenType.ERROR);
        }
        if (x === 125) return this.#token(TokenType.BRACE_RIGHT);
        return this.#token(TokenType.ERROR);
      case 2:
        if ((65 <= x && x <= 90) || x === 95) {
          return this.#identifier();
        }
        return this.#token(TokenType.ERROR);
      case 1:
        switch (x) {
          case 33:
            if (this.#match(61)) {
              return this.#token(TokenType.IS_NOT);
            }
            return this.#token(TokenType.NOT);
          case 34:
            return this.#string();
          case 36:
            return this.#identifier();
          case 38:
            if (this.#match(38)) {
              return this.#token(TokenType.AND);
            }
            return this.#token(TokenType.ERROR);
          case 40:
            return this.#token(TokenType.PAREN_LEFT);
          case 41:
            return this.#token(TokenType.PAREN_RIGHT);
          case 44:
            return this.#token(TokenType.COMMA);
          case 46:
            return this.#token(TokenType.DOT);
          case 58:
            return this.#token(TokenType.COLON);
          case 59:
            return this.#token(TokenType.SEMICOLON);
          case 60:
            if (this.#match(61)) {
              return this.#token(TokenType.NOT_MORE);
            }
            return this.#token(TokenType.LESS);
          case 61:
            if (this.#match(61)) {
              return this.#token(TokenType.IS);
            }
            return this.#token(TokenType.BE);
          case 62:
            if (this.#match(61)) {
              return this.#token(TokenType.NOT_LESS);
            }
            return this.#token(TokenType.MORE);
          default:
            return this.#token(TokenType.ERROR);
        }
      default:
        return this.#token(TokenType.ERROR);
    }
  }
}
