export enum TokenType {
  AND,
  BE,
  BRACE_LEFT,
  BRACE_RIGHT,
  BREAK,
  CLASS,
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
  LABEL,
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
  RETURN,
  SEMICOLON,
  STRING,
  THIS,
  TRUE,
  VAR,
  WHILE,
}

const KEYWORDS: Record<string, TokenType> = {
  break: TokenType.BREAK,
  continue: TokenType.CONTINUE,
  class: TokenType.CLASS,
  else: TokenType.ELSE,
  false: TokenType.FALSE,
  if: TokenType.IF,
  log: TokenType.LOG,
  new: TokenType.NEW,
  return: TokenType.RETURN,
  this: TokenType.THIS,
  true: TokenType.TRUE,
  var: TokenType.VAR,
  while: TokenType.WHILE,
};
export class Lex {
  types: TokenType[] = [];
  indices: number[] = [];
  size = 0;

  lineAndColumn(token: number) {
    let line = 1;
    let index = 0;
    for (let i = 0; i < this.indices[token]; i++) {
      if (this.source[i] === "\n") {
        line++;
        index = i;
      }
    }
    return [line, this.indices[token] - index + 1];
  }

  lexeme(token: number) {
    return this.source.slice(this.indices[token], this.indices[token + 1])
      .trim();
  }

  #token(type: TokenType, from: number) {
    this.indices[this.size] = from;
    this.types[this.size++] = type;
  }

  constructor(private source: string) {
    let index = 0;
    while (index < source.length) {
      while (index < source.length && /[\n\r\s]/.test(source[index])) {
        index++;
      }
      if (index >= source.length) {
        break;
      }
      const from = index;
      if (/[A-Z_a-z]/.test(source[index])) {
        do {
          index++;
        } while (
          index < source.length && /[0-9A-Z_a-z]/.test(source[index])
        );
        this.#token(
          KEYWORDS[source.slice(from, index)] ?? TokenType.IDENTIFIER,
          from,
        );
        continue;
      }
      switch (source[index++]) {
        case "{":
          this.#token(TokenType.BRACE_LEFT, from);
          continue;
        case "}":
          this.#token(TokenType.BRACE_RIGHT, from);
          continue;
        case "&":
          if (source[index] === "&") {
            index++;
            this.#token(TokenType.AND, from);
          } else {
            this.#token(TokenType.ERROR, from);
          }
          continue;
        case "=":
          if (source[index] === "=") {
            index++;
            this.#token(TokenType.IS, from);
          } else {
            this.#token(TokenType.BE, from);
          }
          continue;
        case ":":
          this.#token(TokenType.COLON, from);
          continue;
        case ",":
          this.#token(TokenType.COMMA, from);
          continue;
        case ".":
          this.#token(TokenType.DOT, from);
          continue;
        case "!":
          if (source[index] === "=") {
            index++;
            this.#token(TokenType.IS_NOT, from);
          } else {
            this.#token(TokenType.NOT, from);
          }
          continue;
        case "<":
          if (source[index] === "=") {
            index++;
            this.#token(TokenType.NOT_MORE, from);
          } else {
            this.#token(TokenType.LESS, from);
          }
          continue;
        case ">":
          if (source[index] === "=") {
            index++;
            this.#token(TokenType.NOT_LESS, from);
          } else {
            this.#token(TokenType.MORE, from);
          }
          continue;
        case "|":
          if (source[index] === "|") {
            index++;
            this.#token(TokenType.OR, from);
          } else {
            this.#token(TokenType.ERROR, from);
          }
          continue;
        case "#":
          while (
            index < this.source.length &&
            /[0-9A-Z_a-z]/.test(this.source[index])
          ) {
            index++;
          }
          this.#token(TokenType.LABEL, from);
          continue;
        case "(":
          this.#token(TokenType.PAREN_LEFT, from);
          continue;
        case ")":
          this.#token(TokenType.PAREN_RIGHT, from);
          continue;
        case ";":
          this.#token(TokenType.SEMICOLON, from);
          continue;
        case '"':
          for (; index < source.length; index++) {
            if (source[index] === '"') {
              break;
            }
            if (source[index] === "\\") {
              index++;
            }
          }
          if (index >= this.source.length) {
            throw new Error("Unterminated string");
          }
          index++;
          this.#token(TokenType.STRING, from);
          continue;
        default:
          this.#token(TokenType.ERROR, from);
      }
    }
    this.#token(TokenType.END, source.length);
  }

  toString() {
    return Array(this.size).keys().map((i) =>
      `${this.indices[i]}:${TokenType[this.types[i]]}`
    ).toArray().join();
  }
}
