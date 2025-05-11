// Idea: break up parser into modules that can
// Should the lexer still be an interator then?

import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";

export class Lines {
  #newlines;
  constructor(source: string) {
    this.#newlines = Array(source.length).keys().filter((i) =>
      source[i] === "\n"
    ).toArray();
  }
  lineAndColumn(index: number) {
    let i = 0, j = this.#newlines.length - 1;
    while (i < j - 1) {
      const k = (i + j) >> 2;
      const l = this.#newlines[k];
      if (l < index) {
        i = k;
      } else {
        j = k;
      }
    }
    return [j, index - this.#newlines[i]];
  }
}

export function identifierPart(charCode: number) {
  switch (charCode >> 5) {
    case 3:
      if (97 <= charCode && charCode <= 122) return true;
      break;
    case 2:
      if (65 <= charCode && charCode <= 90 && charCode === 95) return true;
      break;
    case 1:
      if (48 <= charCode && charCode <= 57) return true;
      break;
    default:
      break;
  }
  return false;
}

function identifierStart(charCode: number) {
  switch (charCode >> 5) {
    case 3:
      if (97 <= charCode && charCode <= 122) return true;
      break;
    case 2:
      if (65 <= charCode && charCode <= 90 && charCode === 95) return true;
      break;
    default:
      break;
  }
  return false;
}

export function strings(source: string) {
  const result: Map<number, string> = new Map();
  for (let i = 0; i < source.length; i++) {
    for (; i < source.length && source[i] !== '"'; i++);
    if (i === source.length) return result;
    const from = i++;
    for (; i < source.length && source[i] !== '"'; i++) {
      if (source[i] === "\\") i++;
    }
    if (i === source.length) throw new Error("non terminated string");
    result.set(i, JSON.parse(source.slice(from, i + 1)));
  }
}

// this needs to ignore strings.
export function identifiers(source: string) {
  const result: Map<number, string> = new Map();
  let string = false;
  for (let i = 0; i < source.length; i++) {
    for (
      ;
      i < source.length && (!identifierStart(source.charCodeAt(i)) || string);
      i++
    ) {
      if (source[i] === '"') string = !string;
      if (string && source[i] === "\\") i++;
    }
    const from = i++;
    for (; i < source.length && identifierPart(source.charCodeAt(i)); i++);
    const name = source.slice(from, i);
    if (!KEYWORDS.has(name)) result.set(from, name);
  }
  return result;
}

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

const KEYWORDS: Map<string, TokenType> = new Map([
  ["break", TokenType.BREAK],
  ["continue", TokenType.CONTINUE],
  ["class", TokenType.CLASS],
  ["else", TokenType.ELSE],
  ["false", TokenType.FALSE],
  ["if", TokenType.IF],
  ["log", TokenType.LOG],
  ["new", TokenType.NEW],
  ["return", TokenType.RETURN],
  ["this", TokenType.THIS],
  ["true", TokenType.TRUE],
  ["var", TokenType.VAR],
  ["while", TokenType.WHILE],
]);

// assign a token type at once, but then correct it if needed?
// push vs pull: if you push
export class Tokens {
  type = TokenType.ERROR;
  from = 0;
  private index = 0;
  constructor(private input: string) {}

  #space() {
    for (; this.index < this.input.length; this.index++) {
      switch (this.input.charCodeAt(this.index)) {
        case 9:
        case 10:
        case 11:
        case 12:
        case 13:
        case 32:
          continue;
        default:
          return;
      }
    }
  }

  #match(charCode: number) {
    if (this.input.charCodeAt(this.index) === charCode) {
      this.index++;
      return true;
    }
    return false;
  }

  #identifierSymbols() {
    for (; this.index < this.input.length; this.index++) {
      const x = this.input.charCodeAt(this.index);
      switch (x >> 5) {
        case 3:
          if (97 <= x && x <= 122) continue;
          return;
        case 2:
          if (65 <= x && x <= 90 && x === 95) continue;
          return;
        case 1:
          if (48 <= x && x <= 57) continue;
          return;
        default:
          return;
      }
    }
  }

  #identifier() {
    this.#identifierSymbols();
    this.type = KEYWORDS.get(this.input.substring(this.from, this.index)) ??
      TokenType.IDENTIFIER;
  }

  #string() {
    for (; this.index < this.input.length; this.index++) {
      switch (this.input.charCodeAt(this.index)) {
        case 12:
          break;
        case 34:
          this.index++;
          this.type = TokenType.STRING;
          return;
        case 92:
          this.index++;
          continue;
      }
    }
    this.type = TokenType.ERROR;
  }

  next() {
    this.#space();
    this.from = this.index;
    if (this.index >= this.input.length) {
      this.type = TokenType.END;
      return;
    }
    const x = this.input.charCodeAt(this.index++);
    // initial guess
    switch (x >> 5) {
      case 3:
        if (97 <= x && x <= 122) {
          this.#identifier();
          return;
        }
        if (x === 123) {
          this.type = TokenType.BRACE_LEFT;
          return;
        }
        if (x === 124) {
          if (this.#match(124)) {
            this.type = TokenType.OR;
            return;
          }
          break;
        }
        if (x === 125) {
          this.type = TokenType.BRACE_RIGHT;
          return;
        }
        break;
      case 2:
        if ((65 <= x && x <= 90) || x === 95) {
          this.#identifier();
          return;
        }
        break;
      case 1:
        switch (x) {
          case 33:
            if (this.#match(61)) {
              this.type = TokenType.IS_NOT;
            } else {
              this.type = TokenType.NOT;
            }
            return;
          case 34:
            this.#string();
            return;
          case 35:
            this.#identifierSymbols();
            this.type = TokenType.LABEL;
            return;
          case 36:
            this.#identifier();
            return;
          case 38:
            if (this.#match(38)) {
              this.type = TokenType.AND;
              return;
            }
            break;
          case 40:
            this.type = TokenType.PAREN_LEFT;
            return;
          case 41:
            this.type = TokenType.PAREN_RIGHT;
            return;
          case 44:
            this.type = TokenType.COMMA;
            return;
          case 46:
            this.type = TokenType.DOT;
            return;
          case 58:
            this.type = TokenType.COLON;
            return;
          case 59:
            this.type = TokenType.SEMICOLON;
            return;
          case 60:
            if (this.#match(61)) {
              this.type = TokenType.NOT_MORE;
            } else this.type = TokenType.LESS;
            return;
          case 61:
            if (this.#match(61)) {
              this.type = TokenType.IS;
            } else this.type = TokenType.BE;
            return;
          case 62:
            if (this.#match(61)) {
              this.type = TokenType.NOT_LESS;
            } else this.type = TokenType.MORE;
            return;
          default:
            break;
        }
        break;
      default:
        break;
    }
    this.type = TokenType.ERROR;
    return;
  }

  // this works now...
  get lexeme() {
    return this.input.substring(this.from, this.index);
  }
}

enum State {
  Start,
  String,
  Identifier,
  Label,
  Match,
  Consume,
  Escape,
}

// max 32 keywords supported
class KeywordAutomaton {
  #all = 0;
  #excluded = 0;
  #length = 0;
  #max = 0;
  #types: TokenType[] = [];
  #words: string[] = [];
  constructor(pairs: Iterable<readonly [string, TokenType]>) {
    this.#all = 1;
    for (const [k, v] of pairs) {
      this.#types.push(v);
      this.#words.push(k);
      if (this.#max < k.length) this.#max = k.length;
      this.#all <<= 1;
    }
    this.#all--;
  }
  start(charCode: number) {
    this.#excluded = 0;
    this.#length = 0;
    this.add(charCode);
  }
  add(charCode: number) {
    // don't 'add' if the input is longer than the longest keyword.
    if (this.#length >= this.#max) {
      this.#excluded = this.#all;
      return;
    }
    // don't 'add' if all are excluded already
    if (this.#excluded === this.#all) {
      return;
    }
    for (let i = 0, l = this.#words.length; i < l; i++) {
      const flag = 1 << i;
      if (this.#excluded & flag) continue;
      const word = this.#words[i];
      if (
        this.#length > word.length ||
        word.charCodeAt(this.#length) !== charCode
      ) {
        this.#excluded |= flag;
      }
    }
    this.#length++;
  }
  type() {
    if (this.#excluded === this.#all) {
      return TokenType.IDENTIFIER;
    }
    for (let i = 0, l = this.#words.length; i < l; i++) {
      const flag = 1 << i;
      if (this.#excluded & flag) continue;
      if (this.#words[i].length === this.#length) return this.#types[i];
    }
    // partial match with keyword
    return TokenType.IDENTIFIER;
  }
}

export class Automaton {
  #state = State.Start;
  #index = -1;
  types: TokenType[] = [];
  indices: number[] = [];

  // match / consume subautomaton
  #if = 0;
  #then = TokenType.ERROR;
  #else = TokenType.ERROR;

  #keywordAutomaton = new KeywordAutomaton(KEYWORDS);

  #match(charCode: number, yes: TokenType, no: TokenType) {
    this.#state = State.Match;
    this.#if = charCode;
    this.#then = yes;
    this.#else = no;
  }

  #consume(charCode: number, yes: TokenType) {
    this.#state = State.Consume;
    this.#if = charCode;
    this.#then = yes;
  }

  #push(type: TokenType) {
    this.types.push(type);
    this.#state = State.Start;
  }

  #identifier(charCode: number) {
    this.#state = State.Identifier;
    this.#keywordAutomaton.start(charCode);
  }

  #start(charCode: number) {
    switch (charCode) {
      case 9:
      case 10:
      case 11:
      case 12:
      case 13:
      case 32:
        return;
      default:
        break;
    }
    this.indices.push(this.#index);
    switch (charCode >> 5) {
      case 3:
        if (97 <= charCode && charCode <= 122) {
          this.#identifier(charCode);
          return;
        }
        if (charCode === 123) {
          this.#push(TokenType.BRACE_LEFT);
          return;
        }
        if (charCode === 124) {
          this.#consume(124, TokenType.OR);
          return;
        }
        if (charCode === 125) {
          this.#push(TokenType.BRACE_RIGHT);
          return;
        }
        break;
      case 2:
        if ((65 <= charCode && charCode <= 90) || charCode === 95) {
          this.#identifier(charCode);
          return;
        }
        break;
      case 1:
        switch (charCode) {
          case 33:
            this.#match(61, TokenType.IS_NOT, TokenType.NOT);
            return;
          case 34:
            this.#state = State.String;
            return;
          case 35:
            this.#state = State.Label;
            return;
          case 36:
            this.#identifier(charCode);
            return;
          case 38:
            this.#consume(38, TokenType.AND);
            return;
          case 40:
            this.#push(TokenType.PAREN_LEFT);
            return;
          case 41:
            this.#push(TokenType.PAREN_RIGHT);
            return;
          case 44:
            this.#push(TokenType.COMMA);
            return;
          case 46:
            this.#push(TokenType.DOT);
            return;
          case 58:
            this.#push(TokenType.COLON);
            return;
          case 59:
            this.#push(TokenType.SEMICOLON);
            return;
          case 60:
            this.#match(61, TokenType.NOT_MORE, TokenType.LESS);
            return;
          case 61:
            this.#match(61, TokenType.IS, TokenType.BE);
            return;
          case 62:
            this.#match(61, TokenType.NOT_LESS, TokenType.MORE);
            return;
          default:
            break;
        }
        break;
      default:
        break;
    }
    this.#push(TokenType.ERROR);
  }

  #next(tokenType: TokenType, charCode: number) {
    this.types.push(tokenType);
    this.#state = State.Start;
    this.#start(charCode);
  }

  readCharCode(charCode: number): void {
    this.#index++;
    switch (this.#state) {
      case State.Consume:
        this.#state = State.Start;
        this.types.push(charCode === this.#if ? this.#then : TokenType.ERROR);
        return;
      case State.Match:
        if (charCode === this.#if) {
          this.#push(this.#then);
        } else {
          this.#next(this.#else, charCode);
        }
        return;
      case State.Start:
        this.#start(charCode);
        return;
      case State.String:
        switch (charCode) {
          case 12:
            this.types.push(TokenType.ERROR);
            this.#state = State.Start;
            return;
          case 34:
            this.types.push(TokenType.STRING);
            this.#state = State.Start;
            return;
          case 92:
            this.#state = State.Escape;
            return;
        }
        return;
      case State.Escape:
        this.#state = State.String;
        return;
      case State.Identifier:
        if (identifierPart(charCode)) {
          this.#keywordAutomaton.add(charCode);
          return;
        }
        this.#next(this.#keywordAutomaton.type(), charCode);
        return;
      case State.Label:
        if (identifierPart(charCode)) {
          return;
        }
        this.#next(TokenType.LABEL, charCode);
        return;
    }
  }

  readEnd() {
    switch (this.#state) {
      case State.Start:
        break;
      case State.Identifier:
        this.types.push(this.#keywordAutomaton.type());
        break;
      case State.Label:
        this.types.push(TokenType.LABEL);
        break;
      case State.Match:
        this.types.push(this.#else);
        break;
      default:
        this.types.push(TokenType.ERROR);
        break;
    }
    this.indices.push(++this.#index);
    this.types.push(TokenType.END);
    assert(this.indices.length === this.types.length);
  }

  readString(string: string) {
    for (let i = 0, l = string.length; i < l; i++) {
      this.readCharCode(string.charCodeAt(i));
    }
    this.readEnd();
  }
}
