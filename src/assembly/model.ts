import { SplayMap } from "../collections/splay.ts";
import { Lex, TokenType } from "./parser4.ts";
import {
  Access,
  Binary,
  Block,
  Break,
  Call,
  Continue,
  Expression,
  IfStatement,
  Literal,
  Log,
  New,
  Not,
  Return,
  Statement,
  VarDeclaration,
  Variable,
  WhileStatement,
} from "./parser.ts";
import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";

export enum Kind {
  Access,
  Call,
  Comparison,
  Deleted,
  Else,
  Literal,
  Log,
  New,
  Phi,
  SetField,
  Then,
}
export type Value = number;

function tupleString(...members: unknown[]): string {
  return `(${members.join(" ")})`;
}

type Data =
  | [Kind.Access, Value, string]
  | [Kind.Call, Value, Value[]]
  | [Kind.Comparison, Value, Value]
  | [Kind.Else, Value]
  | [Kind.Literal, boolean | string]
  | [Kind.Log, Value]
  | [Kind.New, string]
  | [Kind.Phi, Value[]]
  | [Kind.SetField, Value, string, Value]
  | [Kind.Then, Value];
export class Entry {
  constructor(
    readonly token: number,
    readonly data?: Data,
    readonly world?: Value,
  ) {}

  toString(): string {
    if (!this.data) return "undefined";
    return tupleString(
      Kind[this.data[0]],
      ...this.data.slice(1).map((d) =>
        d instanceof Array ? tupleString(...d) : d
      ),
    ) + (this.world === undefined ? "" : `[${this.world}]`);
  }
}

type Values = SplayMap<Value>;
type Alternatives = SplayMap<Values>;
const KEYS = {
  break: "<break>",
  continue: "<continue>",
  return: "<return>",
  next: "<next>",
  value: "<value>",
  world: "<world>",
};

export class Model {
  readonly entries: Entry[] = [];
  constructor(private lex: Lex) {}
  #error(token: number, msg: string) {
    const [l, c] = this.lex.lineAndColumn(token);
    return new Error(
      `Compile error at ${
        TokenType[this.lex.types[token]]
      } [${l},${c}]: ${msg}`,
    );
  }

  #enter(token: number, data?: Data, world?: Value): number {
    return this.entries.push(new Entry(token, data, world)) - 1;
  }

  assign(
    values: Values,
    token: number,
    left: Expression,
    right: Expression,
  ): Alternatives {
    switch (this.lex.types[left.token]) {
      case TokenType.IDENTIFIER: {
        const { name } = left as Variable;
        const value = values.select(name);
        if (value === undefined) {
          throw this.#error(token, "Undeclared variable");
        }
        const a = this.expression(values, right);
        const b = this.value(a);
        return this.lift(values.insert(name, b).insert(KEYS.value, b));
      }
      case TokenType.DOT: {
        const { token, object, field } = left as Access;
        const a = this.expression(values, object);
        const b = this.expression(
          a.select(KEYS.next) || SplayMap.empty(),
          right,
        );
        return this.set(
          b,
          KEYS.world,
          this.#enter(
            token,
            [Kind.SetField, this.value(a), field, this.value(b)],
            this.world(b),
          ),
        );
      }
      case TokenType.VAR: {
        const { key: { name } } = left as VarDeclaration;
        const value = values.select(name);
        if (value !== undefined) {
          const token2 = this.entries[value].token;
          const [l, c] = this.lex.lineAndColumn(token2);
          throw this.#error(
            token,
            `Variable already declared at [${l},${c}]`,
          );
        }
        const b = this.expression(values, right);
        return this.set(
          this.set(b, name, this.value(b)),
          KEYS.value,
          this.value(b),
        );
      }
      default:
        throw this.#error(token, "Illegal assignment");
    }
  }

  value(alternatives: Alternatives): Value {
    return this.get(alternatives, KEYS.value);
  }
  world(alternatives: Alternatives): Value {
    return this.get(alternatives, KEYS.world);
  }
  get(alternatives: Alternatives, key: string): Value {
    return alternatives.select(KEYS.next)?.select(key) ?? -1;
  }
  next(alternatives: Alternatives): Values {
    return alternatives.select(KEYS.next) || SplayMap.empty();
  }
  set(
    alternatives: Alternatives,
    key: string,
    value: Value,
  ): Alternatives {
    return this.flatMap(
      alternatives,
      (next) => this.lift(next.insert(key, value)),
    );
  }

  lift(values: Values): Alternatives {
    return SplayMap.empty<Values>().insert(KEYS.next, values);
  }

  flatMap(
    alternatives: Alternatives,
    f: (values: Values) => Alternatives,
  ): Alternatives {
    const x = f(this.next(alternatives));
    return alternatives.delete(KEYS.next).merge(x);
  }

  expression(values: Values, expression: Expression): Alternatives {
    switch (this.lex.types[expression.token]) {
      case TokenType.BE: {
        const { token, left, right } = expression as Binary;
        return this.assign(values, token, left, right);
      }
      case TokenType.DOT: {
        const { token, object, field } = expression as Access;
        const o = this.expression(values, object);
        return this.set(
          o,
          KEYS.value,
          this.#enter(
            token,
            [Kind.Access, this.value(o), field],
            this.get(o, KEYS.world),
          ),
        );
      }
      case TokenType.FALSE:
      case TokenType.STRING:
      case TokenType.TRUE: {
        const { token, value } = expression as Literal;
        return this.lift(
          values.insert(
            KEYS.value,
            this.#enter(token, [Kind.Literal, value]),
          ),
        );
      }
      case TokenType.IDENTIFIER:
      case TokenType.THIS: {
        const value = values.select((expression as Variable).name);
        if (value === undefined) {
          throw this.#error(expression.token, "Undeclared variable");
        }
        if (this.entries[value].data === undefined) {
          throw this.#error(expression.token, "Unassigned variable");
        }
        return this.lift(values.insert(KEYS.value, value));
      }
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE: {
        const { token, left, right } = expression as Binary;
        const l = this.expression(values, left);
        const r = this.flatMap(l, (it) => this.expression(it, right));
        return this.set(
          r,
          KEYS.value,
          this.#enter(token, [
            Kind.Comparison,
            this.value(l),
            this.value(r),
          ]),
        );
      }
      case TokenType.LOG: {
        const { token, value } = expression as Log;
        const values2 = this.expression(values, value);
        return this.set(
          values2,
          KEYS.world,
          this.#enter(
            token,
            [Kind.Log, this.value(values2)],
            this.world(values2),
          ),
        );
      }
      case TokenType.NEW: {
        const { token, klaz } = expression as New;
        return this.lift(
          values.insert(KEYS.value, this.#enter(token, [Kind.New, klaz])),
        );
      }
      case TokenType.PAREN_LEFT: {
        const { token, operator, operands } = expression as Call;
        let w = this.expression(values, operator);
        const x = this.value(w);
        const y: Value[] = [];
        for (const operand of operands) {
          w = w.merge(this.expression(this.next(w), operand));
          y.push(this.value(w));
        }
        const value: Value = this.#enter(token, [
          Kind.Call,
          x,
          y,
        ], this.world(w));
        return this.set(this.set(w, KEYS.world, value), KEYS.value, value);
      }
      case TokenType.VAR: {
        const { key: { name } } = expression as VarDeclaration;
        const check = values.select(name);
        if (check !== undefined) {
          const token = this.entries[check].token;
          const [l, c] = this.lex.lineAndColumn(token);
          throw this.#error(
            expression.token,
            `variable already defined at ${[l, c]}`,
          );
        }
        const u = this.#enter(expression.token);
        return this.lift(values.insert(name, u).insert(KEYS.value, u));
      }
      case TokenType.AND: {
        const { left, right } = expression as Binary;
        return this.ifThenElse(
          left,
          (it: Values) => this.expression(it, right),
          (it: Values) =>
            this.lift(
              it.insert(
                KEYS.value,
                this.#enter(expression.token, [Kind.Literal, false]),
              ),
            ),
          values,
        );
      }
      case TokenType.OR: {
        const { left, right } = expression as Binary;
        return this.ifThenElse(
          left,
          (it: Values) =>
            this.lift(
              it.insert(
                KEYS.value,
                this.#enter(expression.token, [Kind.Literal, true]),
              ),
            ),
          (it) => this.expression(it, right),
          values,
        );
      }
      default:
        throw this.#error(expression.token, "Illegal expression in boolean");
    }
  }

  #block(values: Values, block: Block): Alternatives {
    let alternatives = this.interpret(values, block.statements);
    const next = alternatives.select(KEYS.next);
    if (next === undefined) return alternatives;
    if (block.jump) {
      //alternatives = alternatives.delete(KEYS.next);
      switch (this.lex.types[block.jump.token]) {
        case TokenType.BREAK: {
          const { label } = block.jump as Break;
          return alternatives.delete(KEYS.next).insert(
            label ? `<break ${label}>` : KEYS.break,
            next,
          );
        }
        case TokenType.CONTINUE: {
          const { label } = block.jump as Continue;
          return alternatives.delete(KEYS.next).insert(
            label ? `<continue ${label}>` : KEYS.continue,
            next,
          );
        }
        case TokenType.RETURN: {
          const { expression } = block.jump as Return;
          if (expression === undefined) {
            return alternatives.delete(KEYS.next).insert(KEYS.return, next);
          }
          alternatives = this.flatMap(
            alternatives,
            (next) => this.expression(next, expression),
          );
          const _next = this.next(alternatives);
          return alternatives.delete(KEYS.next).insert(KEYS.return, _next);
        }
      }
    }
    return alternatives;
  }

  phi(left: Values, right: Values): Values {
    for (const [k, v] of right.entries()) {
      const value = left.select(k);
      if (value === undefined) {
        left = left.insert(k, v);
      } else {
        const entry = this.entries[value];
        if (entry.data?.[0] === Kind.Phi) {
          entry.data[1].push(v);
        } else {
          left = left.insert(
            k,
            this.#enter(entry.token, [Kind.Phi, [value, v]]),
          );
        }
      }
    }
    return left;
  }

  interpret(values: Values, statements: Statement[]): Alternatives {
    let alternatives = this.lift(values);
    for (const statement of statements) {
      if (statement instanceof Block) {
        alternatives = this.flatMap(
          alternatives,
          (next) => this.#block(next, statement as Block),
        );
        if (alternatives.select(KEYS.next) === undefined) return alternatives;
        continue;
      }
      switch (this.lex.types[statement.token]) {
        case TokenType.IF: {
          const { condition, onTrue, onFalse } = statement as IfStatement;
          alternatives = this.flatMap(alternatives, (next) =>
            this.ifThenElse(
              condition,
              (it) => this.#block(it, onTrue),
              onFalse ? (it) => this.#block(it, onFalse) : this.lift,
              next,
            ));
          if (alternatives.select(KEYS.next) === undefined) return alternatives;
          continue;
        }
        case TokenType.WHILE: {
          // it actually starts with creating seemingly pointless joins and phonies
          // it is the same idea though.
          const phonies: { [_: string]: [Value] } = {};
          // the painful one...
          // varaibles are not tracked, which is why we need so many phonies here.
          let values: Values = SplayMap.empty();
          for (const [k, v] of this.next(alternatives).entries()) {
            phonies[k] = [v];
            values = values.insert(
              k,
              this.#enter(statement.token, [Kind.Phi, phonies[k]]),
            );
          }
          alternatives = alternatives.insert(KEYS.next, values);
          // ready
          const { condition, onTrue, label } = statement as WhileStatement;
          alternatives = this.flatMap(
            alternatives,
            (next) =>
              this.ifThenElse(
                condition,
                (it) => {
                  const alt = this.#block(it, onTrue);
                  const next = alt.select(KEYS.next);
                  if (next === undefined) return alt;
                  return alt.delete(KEYS.next).insert(KEYS.continue, next);
                },
                this.lift,
                next,
              ),
          );

          // do we get a payoff now?
          const cont = alternatives.select(KEYS.continue);
          if (cont !== undefined) {
            alternatives = alternatives.delete(KEYS.continue);
            for (const [k, v] of Object.entries(phonies)) {
              const w = cont.select(k);
              if (w !== undefined) v.push(w);
            }
          }
          if (label !== undefined) {
            const key = `<continue ${label}>`;
            const cl = alternatives.select(key);
            if (cl !== undefined) {
              alternatives = alternatives.delete(key);
              for (const [k, v] of Object.entries(phonies)) {
                const w = cl.select(k);
                if (w !== undefined) v.push(w);
              }
            }
          }

          // second jump target after the loop
          const br = alternatives.select(KEYS.break);
          if (br !== undefined) {
            alternatives = alternatives.delete(KEYS.break).insert(
              KEYS.next,
              this.phi(this.next(alternatives), br),
            );
          }
          if (label !== undefined) {
            const key = `<break ${label}>`;
            const brl = alternatives.select(key);
            if (brl !== undefined) {
              alternatives = alternatives.delete(key).insert(
                KEYS.next,
                this.phi(this.next(alternatives), brl),
              );
            }
          }

          if (alternatives.select(KEYS.next) === undefined) return alternatives;
          continue;
        }
        default:
          alternatives = this.flatMap(
            alternatives,
            (next) => this.expression(next, statement as Expression),
          );
          continue;
      }
    }
    return alternatives;
  }

  par(left: Alternatives, right: Alternatives): Alternatives {
    for (const [k, v] of right.entries()) {
      const valT = left.select(k);
      if (valT === undefined) {
        left = left.insert(k, v);
      } else {
        left = left.insert(k, this.phi(valT, v));
      }
    }
    return left;
  }

  __ifThenElse(
    condition: Expression,
    thenBlock: (_: Values) => Alternatives,
    elseBlock: (_: Values) => Alternatives,
    values: Values,
  ): Alternatives {
    const alt0 = this.expression(values, condition);
    const altT = this.flatMap(
      alt0,
      (next) =>
        thenBlock(
          next.insert(
            KEYS.world,
            this.#enter(
              condition.token,
              [Kind.Then, this.value(alt0)],
              next.select(KEYS.world),
            ),
          ),
        ),
    );
    const altF = this.flatMap(
      alt0,
      (next) =>
        elseBlock(
          next.insert(
            KEYS.world,
            this.#enter(
              condition.token,
              [Kind.Else, this.value(alt0)],
              next.select(KEYS.world),
            ),
          ),
        ),
    );
    return this.par(altT, altF);
  }

  ifThenElse(
    condition: Expression,
    thenBlock: (_: Values) => Alternatives,
    elseBlock: (_: Values) => Alternatives,
    values: Values,
  ): Alternatives {
    switch (this.lex.types[condition.token]) {
      case TokenType.AND: {
        const [l, c] = this.lex.lineAndColumn(condition.token);
        const key = `<goto [${l},${c}]>`;
        const elseBlock2 = (it: Values) =>
          SplayMap.empty<Values>().insert(key, it);
        const { left, right } = condition as Binary;
        // replace the else block with the continuation
        // do the expression
        const alt0 = this.ifThenElse(
          left,
          (it) => this.ifThenElse(right, thenBlock, elseBlock2, it),
          elseBlock2,
          values,
        );
        const gt = alt0.select(key);
        if (gt !== undefined) {
          return this.par(alt0.delete(key), elseBlock(gt));
        }
        return alt0;
      }
      case TokenType.BE: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(
          right,
          (it) =>
            this.flatMap(
              this.assign(
                it,
                condition.token,
                left,
                new Literal(right.token, true),
              ),
              thenBlock,
            ),
          (it) =>
            this.flatMap(
              this.assign(
                it,
                condition.token,
                left,
                new Literal(right.token, false),
              ),
              elseBlock,
            ),
          values,
        );
      }
      case TokenType.DOT:
      case TokenType.IDENTIFIER:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.PAREN_LEFT:
        return this.__ifThenElse(condition, thenBlock, elseBlock, values);
      case TokenType.FALSE:
        return elseBlock(values);
      case TokenType.LOG: {
        const { token, value } = condition as Log;
        return this.ifThenElse(value, (model) =>
          thenBlock(
            model.insert(
              KEYS.world,
              this.#enter(token, [
                Kind.Log,
                this.#enter(token, [Kind.Literal, true]),
              ], model.select(KEYS.world)),
            ),
          ), (model) =>
          elseBlock(
            model.insert(
              KEYS.world,
              this.#enter(token, [
                Kind.Log,
                this.#enter(token, [Kind.Literal, false]),
              ], model.select(KEYS.world)),
            ),
          ), values);
      }
      case TokenType.NOT:
        return this.ifThenElse(
          (condition as Not).expression,
          elseBlock,
          thenBlock,
          values,
        );
      case TokenType.OR: {
        const [l, c] = this.lex.lineAndColumn(condition.token);
        const key = `<goto [${l},${c}]>`;
        const thenBlock2 = (it: Values) =>
          SplayMap.empty<Values>().insert(key, it);
        const { left, right } = condition as Binary;
        const alt0 = this.ifThenElse(
          left,
          thenBlock2,
          (it) => this.ifThenElse(right, thenBlock2, elseBlock, it),
          values,
        );
        const gt = alt0.select(key);
        if (gt !== undefined) {
          return this.par(alt0.delete(key), elseBlock(gt));
        }
        return alt0;
      }
      case TokenType.TRUE:
        return thenBlock(values);
      default:
        throw this.#error(condition.token, "Illegal condition expression");
    }
  }
}
