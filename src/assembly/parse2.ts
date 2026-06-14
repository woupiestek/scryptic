// idea: collect indices of tokens by type then come up woith an algorithm that processes each type in parallel, possibly in a few iterations depending on ast depth

import { Lex, TokenType } from "./lex.ts";

export enum NodeType {
  BLOCK,
  CLASS,
  CONTROL,
  EXPR,
  JUMP,
  LABEL,
  METHOD,
}

export class Parse2 {
  // node data
  types: (NodeType | null)[] = [];
  tokens: number[] = []; // token for each node, maybe turn it around?
  // for the tree structure
  parents: number[] = [];

  #byType: Map<TokenType, number[]> = new Map(
    Array.from({ length: 36 }, (_, i) => [i, []]),
  );
  #rootsByToken: number[] = [];

  constructor(readonly lex: Lex) {
    for (let i = 0; i < lex.types.length; i++) {
      this.#byType.get(lex.types[i])!.push(i);
    }

    this.#rootsByToken = Array(this.lex.size).keys().toArray();
    this.tokens = Array(this.lex.size).keys().toArray();
    this.types = Array.from({ length: this.lex.size }, () => null);

    // leaf types
    for (
      const type of [
        TokenType.FALSE,
        TokenType.IDENTIFIER,
        TokenType.STRING,
        TokenType.THIS,
        TokenType.TRUE,
      ]
    ) {
      for (const i of this.#byType.get(type)!) this.#makeNode(NodeType.EXPR, i);
    }

    for (const i of this.#byType.get(TokenType.LABEL)!) {
      this.#makeNode(NodeType.LABEL, i);
    }

    for (
      const i of [
        this.#byType.get(TokenType.BREAK)!,
        this.#byType.get(TokenType.CONTINUE)!,
      ].flat()
    ) {
      const nodeId = this.#makeNode(NodeType.LABEL, i);
      if (
        this.#rootByToken(i + 1) !== undefined &&
        this.types[this.#rootByToken(i + 1)] === NodeType.LABEL
      ) {
        this.parents[this.#rootByToken(i + 1)] = nodeId;
      }
    }

    {
      const nodes: number[] = [];
      for (
        const i of [TokenType.PAREN_LEFT, TokenType.PAREN_RIGHT].flatMap((
          type,
        ) => this.#byType.get(type)!).sort((a, b) => a - b)
      ) {
        if (this.lex.types[i] === TokenType.PAREN_LEFT) {
          nodes.push(this.#makeNode(NodeType.EXPR, i));
        } else {
          if (!nodes.length) throw new Error("mismatched ')'");
          this.#rootsByToken[i] = nodes.pop()!;
        }
      }
    }

    {
      const nodes: number[] = [];
      for (
        const i of [TokenType.BRACE_LEFT, TokenType.BRACE_RIGHT].flatMap((
          type,
        ) => this.#byType.get(type)!).sort((a, b) => a - b)
      ) {
        if (this.lex.types[i] === TokenType.BRACE_LEFT) {
          nodes.push(this.#makeNode(NodeType.BLOCK, i));
        } else {
          if (!nodes.length) throw new Error("mismatched ')'");
          this.#rootsByToken[i] = nodes.pop()!;
        }
      }
    }

    const unaries = [
      TokenType.LOG,
      TokenType.NOT,
      TokenType.NEW,
      TokenType.VAR,
      // reversing the order here changes the order of the expressions
      // but at least the tree made sense
    ].flatMap((type) => this.#byType.get(type)!); //.sort((a, b) => b - a);
    unaries.map((ti) => this.#makeNode(NodeType.EXPR, ti)).forEach(
      (unary, i) => {
        this.parents[unaries[i] + 1] = unary; //why not?
      },
    );

    this.#binops(this.#byType.get(TokenType.DOT)!);

    this.#binops(
      [
        TokenType.BE, // hmmmpf... maybe BE is not handled correctly now.
        TokenType.IS_NOT,
        TokenType.IS,
        TokenType.LESS,
        TokenType.MORE,
        TokenType.NOT_LESS,
        TokenType.NOT_MORE,
      ].flatMap((type) => this.#byType.get(type)!).sort((a, b) => a - b),
    );

    this.#binops(
      [
        TokenType.AND,
        TokenType.OR,
      ].flatMap((type) => this.#byType.get(type)!).sort((a, b) => a - b),
    );

    this.#binops(this.#byType.get(TokenType.COMMA)!);

    // functions calls remain an issue
    for (const i of this.#byType.get(TokenType.PAREN_LEFT)!) {
      if (this.parents[this.#rootByToken(i)] === undefined) {
        this.parents[this.#rootByToken(i - 1)] = this.#rootByToken(i);
      }
    }

    for (const i of this.#byType.get(TokenType.SEMICOLON)!) {
      this.#rootsByToken[i] = this.#rootByToken(i - 1);
    }

    // things to figure out here.
  }

  #rootByToken(i: number) {
    while (this.parents[this.#rootsByToken[i]] !== undefined) {
      this.#rootsByToken[i] = this.parents[this.#rootsByToken[i]];
    }
    return this.#rootsByToken[i];
  }

  #binops(is: number[]) {
    // now doesn't this work out?
    for (const i of is) {
      const nodeId = this.#makeNode(NodeType.EXPR, i);
      this.parents[this.#rootByToken(i + 1)] = nodeId;
      this.parents[this.#rootByToken(i - 1)] = nodeId;
    }
  }

  #makeNode(type: NodeType, token: number) {
    this.types[token] = type;
    return token;
  }

  toString() {
    // for now--just fake a root node
    const root = this.types.length;

    const firstChildren: number[] = [];
    const leftSiblings: number[] = [];
    const depth: number[] = Array.from({ length: root + 1 }, () => 0);
    for (let i = root; i >= 0; i--) {
      const j = this.parents[i] ?? root;
      leftSiblings[i] = firstChildren[j];
      firstChildren[j] = i;
      depth[i] = 1 + depth[j];
    }
    const positions: number[] = [root];
    a: for (
      let i = root;
      positions.length <= root;
      positions.push(i = leftSiblings[i])
    ) {
      while (firstChildren[i] !== undefined) {
        positions.push(i = firstChildren[i]);
      }
      while (leftSiblings[i] === undefined) {
        i = this.parents[i] ?? root;
        if (i === root) break a;
      }
    }

    const result = positions.map((i) =>
      "  ".repeat(depth[i]) +
      this.lex.lexeme(this.tokens[i]) + ":" +
      (TokenType[this.lex.types[this.tokens[i]]] ?? "") + ":" +
      ((this.types[i] && NodeType[this.types[i]]) ?? "")
    ).join("\n");

    console.log(JSON.stringify({
      //   firstChildren,
      //   leftSiblings,
      //   positions,
      parents: this.parents,
      // source: this.lex.source,
    }));
    return result;
  }
}
