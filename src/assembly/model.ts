import { RedBlackTreeMap } from "../redBlack3.ts";
import { Token, TokenType } from "./lexer.ts";
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
  Return,
  SetField,
  Then,
  This,
  Undefined,
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
  | [Kind.Then, Value]
  | [Kind.This];
export class Entry {
  constructor(
    readonly token: Token,
    readonly data?:
      | [Kind.Access, Value, string]
      | [Kind.Call, Value, Value[]]
      | [Kind.Comparison, Value, Value]
      | [Kind.Else, Value]
      | [Kind.Literal, boolean | string]
      | [Kind.Log, Value]
      | [Kind.New, string]
      | [Kind.Phi, Value[]]
      | [Kind.SetField, Value, string, Value]
      | [Kind.Then, Value]
      | [Kind.This],
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

type Snapshot = {
  world: Value;
  values: RedBlackTreeMap<Value>;
  continuation: Continuation;
};

type Continuation =
  | "next"
  | "return"
  | ["return", Value]
  | "break"
  | ["break", string]
  | "continue"
  | ["continue", string]
  | ["goto", Expression];

export class Model {
  #world: Value = -1; // bad idea?
  #values: RedBlackTreeMap<Value> = RedBlackTreeMap.EMPTY;
  #continuation: Continuation = "next";
  #snapshots: Snapshot[] = [];

  readonly entries: Entry[] = [];
  #data(index: number): Data | undefined {
    return this.entries[index].data;
  }

  snapshot(): Snapshot {
    return {
      world: this.#world,
      values: this.#values,
      continuation: this.#continuation,
    };
  }

  swap({ world, values, continuation }: Snapshot): Snapshot {
    const snapshot = this.snapshot();
    this.#world = world;
    this.#values = values;
    this.#continuation = continuation;
    return snapshot;
  }

  #get(key: string): Value | undefined {
    return this.#values.get(key);
  }

  #set(key: string, value: Value) {
    this.#values = this.#values.add(key, value);
  }

  static #error(token: Token, msg: string) {
    return new Error(
      `Compile error at ${
        TokenType[token.type]
      } [${token.line},${token.column}]: ${msg}`,
    );
  }

  #enter(token: Token, data: Data, world?: Value): number {
    return this.entries.push(new Entry(token, data, world)) - 1;
  }

  assign(token: Token, left: Expression, right: Expression): Value {
    switch (left.token.type) {
      case TokenType.IDENTIFIER: {
        const { name } = left as Variable;
        if (this.#get(name) === undefined) {
          throw Model.#error(token, "Undeclared variable");
        }
        const vr = this.value(right);
        this.#set(name, vr);
        return vr;
      }
      case TokenType.DOT: {
        const { token, object, field } = left as Access;
        const a = this.value(object);
        const b = this.value(right);
        // no trying to track changes to object (yet)
        this.#world = this.#enter(
          token,
          [Kind.SetField, a, field, b],
          this.#world,
        );
        return b;
      }
      case TokenType.VAR: {
        const { key: { name } } = left as VarDeclaration;
        if (this.#get(name) !== undefined) {
          // no access to other variables token token, alas
          throw Model.#error(token, "variable override");
        }
        const vr = this.value(right);
        this.#set(name, vr);
        return vr;
      }
      default:
        throw Model.#error(token, "Illegal assignment");
    }
  }

  value(expression: Expression): Value {
    switch (expression.token.type) {
      case TokenType.BE: {
        const { token, left, right } = expression as Binary;
        return this.assign(token, left, right);
      }
      case TokenType.DOT: {
        const { token, object, field } = expression as Access;
        return this.#enter(
          token,
          [Kind.Access, this.value(object), field],
          this.#world,
        );
      }
      case TokenType.FALSE:
      case TokenType.STRING:
      case TokenType.TRUE: {
        const { token, value } = expression as Literal;
        return this.#enter(token, [Kind.Literal, value]);
      }
      case TokenType.IDENTIFIER: {
        const value = this.#get((expression as Variable).name);
        if (value === undefined) {
          throw Model.#error(expression.token, "Undeclared variable");
        }
        if (value === Kind.Undefined) {
          throw Model.#error(expression.token, "Unassigned variable");
        }
        return value;
      }
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE: {
        const { token, left, right } = expression as Binary;
        return this.#enter(token, [
          Kind.Comparison,
          this.value(left),
          this.value(right),
        ]);
      }
      case TokenType.LOG: {
        const { token, value } = expression as Log;
        const value2 = this.value(value);
        this.#world = this.#enter(token, [Kind.Log, value2], this.#world);
        return value2;
      }
      case TokenType.NEW: {
        const { token, klaz } = expression as New;
        return this.#enter(token, [Kind.New, klaz]);
      }
      case TokenType.PAREN_LEFT: {
        const { token, operator, operands } = expression as Call;
        const value: Value = this.#enter(token, [
          Kind.Call,
          this.value(operator),
          operands.map((it) => this.value(it)),
        ], this.#world);
        this.#world = value;
        return value;
      }
      case TokenType.THIS:
        return Kind.This;
      case TokenType.VAR: {
        const { key: { name } } = expression as VarDeclaration;
        const check = this.#get(name);
        if (check !== undefined) {
          const token = this.entries[check].token;
          throw Model.#error(
            expression.token,
            `variable already defined at ${[token.line, token.column]}`,
          );
        }
        this.#set(name, Kind.Undefined);
        return Kind.Undefined;
      }
      case TokenType.AND: {
        const { left, right } = expression as Binary;
        let value: Value = Kind.Undefined;
        this.ifThenElse(
          left,
          (it: Model) => value = it.value(right),
          Model.#noop,
        );
        return value;
      }
      case TokenType.OR: {
        const { left, right } = expression as Binary;
        let value: Value = Kind.Undefined;
        this.ifThenElse(left, Model.#noop, (it) => value = it.value(right));
        return value;
      }
      default:
        throw Model.#error(expression.token, "Illegal expression in boolean");
    }
  }

  static #noop: (_: Model) => void = (_) => {};

  #block(block: Block): void {
    this.interpret(block.statements);
    if (block.jump) {
      switch (block.jump.token.type) {
        case TokenType.BREAK: {
          const { label } = block.jump as Break;
          if (label) this.#continuation = ["break", label];
          else this.#continuation = "break";
          break;
        }
        case TokenType.CONTINUE: {
          const { label } = block.jump as Continue;
          if (label) this.#continuation = ["continue", label];
          else this.#continuation = "continue";
          break;
        }
        case TokenType.RETURN: {
          const { expression } = block.jump as Return;
          if (expression === undefined) this.#continuation = "return";
          else this.#continuation = ["return", this.value(expression)];
          break;
        }
      }
    }
  }

  interpret(statements: Statement[]): void {
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      switch (statement.token.type) {
        case TokenType.AND: {
          const { left, right } = statement as Binary;
          this.ifThenElse(
            left,
            (it) => it.value(right),
            Model.#noop,
          );
          // no jump expected
          continue;
        }
        case TokenType.BRACE_LEFT: {
          // todo: delete variables out of scope
          this.#block(
            statement as Block,
          );
          if (this.#continuation === "next") continue;
          else return;
        }
        case TokenType.IF: {
          const { condition, onTrue, onFalse } = statement as IfStatement;
          this.ifThenElse(
            condition,
            (it) => it.#block(onTrue),
            onFalse ? (it) => it.#block(onFalse) : Model.#noop,
          );
          if (this.#continuation === "next") {
            continue;
          }
          return;
        }
        case TokenType.WHILE: {
          // it actually starts with creating seemingly pointless joins and phonies
          const worlds = [this.#world];
          this.#world = this.#enter(statement.token, [Kind.Phi, worlds]);
          // it is the same idea though.
          const phonies: { [_: string]: [Value] } = {};
          // the painful one...
          // varaibles are not tracked, which is why we need so many phonies here.
          let values: RedBlackTreeMap<Value> = RedBlackTreeMap.EMPTY;
          for (const [k, v] of this.#values.entries()) {
            phonies[k] = [v];
            values = values.add(
              k,
              this.#enter(statement.token, [Kind.Phi, phonies[k]]),
            );
          }
          this.#values = values;
          // ready
          const { condition, onTrue, label } = statement as WhileStatement;
          let snapshot0;
          this.ifThenElse(condition, (it) => {
            snapshot0 = it.snapshot();
            it.#block(onTrue);
            // first solution: insert a continue statement if not there yet.
            if (it.#continuation === "next") {
              it.#continuation = "continue";
            }
          }, Model.#noop);

          if (snapshot0) {
            this.#snapshots.push(this.swap(snapshot0));
          }
          const snapshots: Snapshot[] = this.#snapshots;
          this.#snapshots = [];
          for (const snapshot of snapshots) {
            switch (snapshot.continuation) {
              case "break":
              case "next":
                // shouldn't the this check be done first?
                this.join(snapshot);
                continue;
              case "continue":
                worlds.push(snapshot.world);
                for (const [k, v] of snapshot.values.entries()) {
                  phonies[k]?.push(v);
                }
                continue;
              case "return":
                this.#snapshots.push(snapshot);
                continue;
              default:
                break;
            }
            switch (snapshot.continuation[0]) {
              case "break":
                if (snapshot.continuation[1] === label) {
                  // shouldn't the this check be done first?
                  this.join(snapshot);
                } else {
                  this.#snapshots.push(snapshot);
                }
                continue;
              case "return":
                this.#snapshots.push(snapshot);
                continue;
              case "continue":
                if (snapshot.continuation[1] === label) {
                  worlds.push(snapshot.world);
                  for (const [k, v] of snapshot.values.entries()) {
                    phonies[k]?.push(v);
                  }
                } else {
                  this.#snapshots.push(snapshot);
                }
                continue;
              default:
                throw Model.#error(statement.token, "Invalid statement");
            }
          }
          // forgot about this...
          switch (this.#continuation) {
            case "break":
            case "continue":
              this.#continuation = "next";
              continue;
            case "next":
              continue;
            case "return":
              return;
            default:
              break;
          }
          switch (this.#continuation[0]) {
            case "break":
            case "continue":
              if (this.#continuation[1] === label) {
                this.#continuation = "next";
                continue;
              } else return;
            case "return":
              return;
            default:
              break;
          }
          throw Model.#error(statement.token, "Invalid statement");
        }
        default:
          this.value(statement as Expression);
          continue;
      }
    }
  }

  join(that: Snapshot) {
    if (this.#world !== that.world) {
      const data = this.entries[this.#world].data;
      if (data?.[0] === Kind.Phi) {
        data[1].push(that.world);
      } else {
        this.#world = this.#enter(this.entries[this.#world].token, [Kind.Phi, [
          this.#world,
          that.world,
        ]]);
      }
    }

    // no adjustment of values if that is not defined?
    // what are we recording anyway?
    for (const [k, v] of this.#values.entries()) {
      const w = that.values.get(k);
      if (w === undefined || w === v) {
        continue;
      }
      const data = this.#data(v);
      if (data?.[0] === Kind.Phi) {
        data[1].push(w);
      } else {
        this.#set(k, this.#enter(this.entries[v].token, [Kind.Phi, [v, w]]));
      }
    }

    for (const [k, v] of that.values.entries()) {
      const u = this.#get(k);
      if (u === undefined) {
        this.#set(k, v);
      }
    }
  }

  __ifThenElse(
    condition: Expression,
    thenBlock: (_: Model) => void,
    elseBlock: (_: Model) => void,
  ) {
    const value = this.value(condition);
    const that = new Model();
    that.swap(this.snapshot());
    this.#world = this.#enter(condition.token, [Kind.Then, value], this.#world);
    thenBlock(this);
    that.#world = this.#enter(condition.token, [Kind.Else, value], this.#world);
    elseBlock(that);
    if (that.#continuation === "next") {
      if (this.#continuation === "next") {
        this.join(that.snapshot());
      } else {
        this.#snapshots.push(this.swap(that.snapshot()));
      }
    } else {
      this.#snapshots.push(that.snapshot());
    }
    this.#snapshots.push(...that.#snapshots);
    return;
  }

  branch(condition: Expression, block: (_: Model) => void): void {
    const snapshots: Snapshot[] = this.#snapshots;
    this.#snapshots = [];
    let that: Model | null = null;
    for (const snapshot of snapshots) {
      if (
        snapshot.continuation[0] === "goto" &&
        snapshot.continuation[1] === condition
      ) {
        if (that === null) {
          that = new Model();
          that.swap(snapshot);
        } else {
          that.join(snapshot);
        }
      } else if (snapshot.continuation === "next") {
        continue;
      } else {
        this.#snapshots.push(snapshot);
      }
    }
    if (that === null) return;
    block(that);
    if (that.#continuation === "next") {
      if (this.#continuation === "next") {
        this.join(that.snapshot());
      } else {
        this.#snapshots.push(this.swap(that.snapshot()));
      }
    } else {
      this.#snapshots.push(that.snapshot());
    }
    this.#snapshots.push(...that.#snapshots);
  }

  ifThenElse(
    condition: Expression,
    thenBlock: (_: Model) => void,
    elseBlock: (_: Model) => void,
  ): void {
    switch (condition.token.type) {
      case TokenType.AND: {
        const { left, right } = condition as Binary;
        // replace the else block with the continuation
        const elseBlock2 = (it: Model) => {
          it.#continuation = ["goto", condition];
        };
        // do the expression
        this.ifThenElse(
          left,
          (it) => it.ifThenElse(right, thenBlock, elseBlock2),
          elseBlock2,
        );
        this.branch(condition, elseBlock);
        return;
      }
      case TokenType.BE: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(right, (it) => {
          it.assign(condition.token, left, new Literal(right.token, true));
          return thenBlock(it);
        }, (it) => {
          it.assign(condition.token, left, new Literal(right.token, false));
          return elseBlock(it);
        });
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
        return this.__ifThenElse(condition, thenBlock, elseBlock);
      case TokenType.FALSE:
        return elseBlock(this);
      case TokenType.LOG: {
        const { token, value } = condition as Log;
        return this.ifThenElse(value, (model) => {
          model.#world = model.#enter(token, [
            Kind.Log,
            model.#enter(token, [Kind.Literal, true]),
          ], this.#world);
          return thenBlock(model);
        }, (model) => {
          model.#world = model.#enter(token, [
            Kind.Log,
            model.#enter(token, [Kind.Literal, false]),
          ], this.#world);
          return elseBlock(model);
        });
      }
      case TokenType.NOT:
        return this.ifThenElse(
          (condition as Not).expression,
          elseBlock,
          thenBlock,
        );
      case TokenType.OR: {
        const { left, right } = condition as Binary;
        const thenBlock2 = (it: Model) => {
          it.#continuation = ["goto", condition];
        };
        this.ifThenElse(
          left,
          thenBlock2,
          (it) => it.ifThenElse(right, thenBlock2, elseBlock),
        );
        this.branch(condition, thenBlock);
        return;
      }
      case TokenType.TRUE:
        return thenBlock(this);
      default:
        throw Model.#error(condition.token, "Illegal condition expression");
    }
  }
}
