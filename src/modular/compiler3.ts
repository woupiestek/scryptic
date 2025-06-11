import { Automaton, TokenType } from "./lexer.ts";
import { Op, Parser } from "./yap.ts";

const CONTROLS = new Set([
  TokenType.BRACE_LEFT,
  TokenType.BREAK,
  TokenType.CONTINUE,
  TokenType.LABEL,
  TokenType.RETURN,
  TokenType.WHILE,
]);
// not getting into the nanopass spirit, am I?

export class Compiler {
  #automaton: Automaton = new Automaton();
  #parser: Parser = new Parser();

  constructor(
    private readonly source: string,
  ) {
    this.#automaton.readString(source);
    this.#parser.visitAll(this.#automaton.types);
    this.#run();
    this.#reorderExpressions();
  }

  #type(id: number) {
    return this.#automaton.types[this.#parser.frames.token(id)];
  }

  #index(id: number) {
    return this.#automaton.indices[this.#parser.frames.token(id)];
  }

  #op: Op[] = [];
  #types: TokenType[] = [];
  #depth: number[] = [];
  #value: number[] = [];
  #names = new Names();

  #depths: number[] = [];

  #pushDepth(i: number) {
    const j = this.#parser.frames.depth(i);
    while (this.#depths[this.#depths.length - 1] >= j) {
      this.#depths.pop();
    }
    this.#depth.push(this.#depths.push(j) - 1);
  }

  #push(i: number, value = -1) {
    this.#op.push(this.#parser.frames.op(i));
    this.#pushDepth(i);
    this.#types.push(this.#type(i));
    this.#value.push(value);
  }

  #run() {
    for (let i = 0, l = this.#parser.frames.size(); i < l; i++) {
      const op = this.#parser.frames.op(i);
      switch (op) {
        case Op.Block:
        case Op.Else:
          this.#push(i);
          break;
        case Op.Stmt:
          if (CONTROLS.has(this.#type(i))) {
            this.#name(i);
          } else {
            this.#push(i);
          }
          break;
        case Op.BlockEnd:
        case Op.ExprTail:
          if (this.#parser.frames.isLeaf(i)) break;
          this.#push(i);
          break;
        case Op.ExprHead:
          this.#exprHead(i);
          break;
        case Op.Identifier:
          this.#name(i);
          break;
        case Op.Label:
          if (this.#type(i) !== TokenType.LABEL) break;
          this.#name(i);
          break;
        default:
          break;
      }
    }
  }

  #exprHead(i: number) {
    switch (this.#type(i)) {
      case TokenType.FALSE:
      case TokenType.LOG:
      case TokenType.NEW:
      case TokenType.NOT:
      case TokenType.THIS:
      case TokenType.TRUE:
      case TokenType.VAR:
        this.#push(i);
        break;
      case TokenType.IDENTIFIER:
        this.#name(i);
        break;
      case TokenType.STRING:
        this.#string(i);
        break;
    }
  }

  #string(id: number) {
    const from = this.#index(id);
    let to = from;
    while (++to < this.source.length && this.source[to] !== '"') {
      if (this.source[to] === "\\") ++to;
    }
    this.#push(id, this.#names.add(this.source.slice(from, to + 1)));
  }

  #name(id: number) {
    const from = this.#index(id);
    let to = from;
    while (++to < this.source.length && /[0-9A-Za-z]/.test(this.source[to]));
    this.#push(id, this.#names.add(this.source.slice(from, to)));
  }

  #lp(prefix: string, i: number) {
    const j = prefix + i;
    return j.substring(j.length - prefix.length - 1);
  }

  #reorderExpressions() {
    let type: TokenType;
    let depth: number;
    let value: number;
    for (let i = this.#parser.frames.size(); i >= 0; i--) {
      if (this.#op[i] !== Op.ExprTail) continue;
      type = this.#types[i];
      depth = this.#depth[i];
      value = this.#value[i];
      let j = i;
      for (; j > 0 && this.#depth[j - 1] >= depth; j--) {
        this.#op[j] = this.#op[j - 1];
        this.#types[j] = this.#types[j - 1];
        this.#depth[j] = this.#depth[j - 1] + 1;
        this.#value[j] = this.#value[j - 1];
      }
      this.#op[j] = Op.ExprTail;
      this.#types[j] = type;
      this.#depth[j] = depth;
      this.#value[j] = value;
    }
  }

  toString() {
    if (!this.#depth.length) return "";
    const prefix = " ".repeat(Math.floor(Math.log10(this.#depth.length)));
    return this.#depth.map((d, i) =>
      `${this.#lp(prefix, i)}:${"  ".repeat(d)}${Op[this.#op[i]]}:${
        TokenType[this.#types[i]]
      }${this.#value[i] === -1 ? "" : ":" + this.#names.get(this.#value[i])}`
    ).join("\n");
  }
}

class Names {
  #entries: Map<string, number> = new Map();
  #values: string[] = [];
  add(name: string) {
    const i = this.#entries.get(name);
    if (i !== undefined) return i;
    const j = this.#values.push(name) - 1;
    this.#entries.set(name, j);
    return j;
  }
  get(id: number) {
    return this.#values[id];
  }
}
