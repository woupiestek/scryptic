import { RedBlackTreeMap } from "../redBlack2.ts";
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
export type Value =
  | [Kind.Access, Value, Value, string]
  | [Kind.Call, Value, Value, Value[]]
  | [Kind.Comparison, TokenType, Value, Value]
  | [Kind.Else, Value, Value]
  | [Kind.Literal, boolean | string]
  | [Kind.Log, Value, Value]
  | [Kind.New, string]
  | [Kind.Phi, Value[]]
  | [Kind.SetField, Value, Value, string, Value]
  | [Kind.Then, Value, Value]
  | Kind.This
  | Kind.Undefined;

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
  | ["continue", string];

export class Model {
  #world: Value = [Kind.Phi, []]; // bad idea?
  #values: RedBlackTreeMap<Value> = RedBlackTreeMap.EMPTY;
  #continuation: Continuation = "next";
  #snapshots: Snapshot[] = [];

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
        const { object, field } = left as Access;
        const a = this.value(object);
        const b = this.value(right);
        // no trying to track changes to object (yet)
        this.#world = [Kind.SetField, this.#world, a, field, b];
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
        const { object, field } = expression as Access;
        return [Kind.Access, this.#world, this.value(object), field];
      }
      case TokenType.FALSE:
      case TokenType.STRING:
      case TokenType.TRUE:
        return [Kind.Literal, (expression as Literal).value];
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
        return [
          Kind.Comparison,
          token.type,
          this.value(left),
          this.value(right),
        ];
      }
      case TokenType.LOG: {
        const value = this.value((expression as Log).value);
        this.#world = [Kind.Log, this.#world, value];
        return value;
      }
      case TokenType.NEW:
        return [Kind.New, (expression as New).klaz];
      case TokenType.PAREN_LEFT: {
        const { operator, operands } = expression as Call;
        const value: Value = [
          Kind.Call,
          this.#world,
          this.value(operator),
          operands.map((it) => this.value(it)),
        ];
        this.#world = value;
        return value;
      }
      case TokenType.THIS:
        return Kind.This;
      case TokenType.VAR: {
        const { key: { name } } = expression as VarDeclaration;
        if (this.#get(name) !== undefined) {
          // no access to token, alas
          throw Model.#error(expression.token, "variable override");
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
        case TokenType.WHILE:
          {
            // it actually starts with creating seemingly pointless joins and phonies
            const worlds = [this.#world];
            this.#world = [Kind.Phi, worlds];
            // it is the same idea though.
            const phonies: { [_: string]: [Value] } = {};
            // the painful one...
            // varaibles are not tracked, which is why we need so many phonies here.
            let values: RedBlackTreeMap<Value> = RedBlackTreeMap.EMPTY;
            for (const [k, v] of this.#values.entries()) {
              phonies[k] = [v];
              values = values.add(k, [Kind.Phi, phonies[k]]);
            }
            this.#values = values;
            // ready
            const { condition, onTrue, label } = statement as WhileStatement;
            this.ifThenElse(condition, (it) => {
              it.#block(onTrue);
              // first solution: insert a continue statement if not there yet.
              if (it.#continuation === "next") {
                it.#continuation = "continue";
              }
            }, Model.#noop);
            // to take care of break and continue now.
            const snapshots: Snapshot[] = [];
            for (const snapshot of this.#snapshots) {
              switch (snapshot.continuation) {
                case "break":
                case "next":
                  this.join(snapshot);
                  continue;
                case "continue":
                  worlds.push(snapshot.world);
                  for (const [k, v] of snapshot.values.entries()) {
                    phonies[k]?.push(v);
                  }
                  continue;
                case "return":
                  snapshots.push(snapshot);
                  continue;
                default:
                  switch (snapshot.continuation[0]) {
                    case "break":
                      if (snapshot.continuation[1] === label) {
                        this.join(snapshot);
                      } else {
                        snapshots.push(snapshot);
                      }
                      continue;
                    case "return":
                      snapshots.push(snapshot);
                      continue;
                    case "continue":
                      if (snapshot.continuation[1] === label) {
                        worlds.push(snapshot.world);
                        for (const [k, v] of snapshot.values.entries()) {
                          phonies[k]?.push(v);
                        }
                      } else {
                        snapshots.push(snapshot);
                      }
                      continue;
                    default:
                      throw Model.#error(statement.token, "Invalid statement");
                  }
              }
            }
            this.#snapshots = snapshots;
          }
          continue;
        default:
          this.value(statement as Expression);
          continue;
      }
    }
  }

  join(that: Snapshot) {
    if (this.#world !== that.world) {
      if (this.#world instanceof Array && this.#world[0] === Kind.Phi) {
        this.#world[1].push(that.world);
      } else {
        this.#world = [Kind.Phi, [this.#world, that.world]];
      }
    }

    // no adjustment of values if that is not defined?
    // what are we recording anyway?
    for (const [k, v] of this.#values.entries()) {
      const w = that.values.get(k);
      if (w === undefined || w === v) {
        continue;
      }
      if (v instanceof Array && v[0] === Kind.Phi) {
        v[1].push(w);
      } else {
        this.#set(k, [Kind.Phi, [v, w]]);
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
    const snapshot0 = this.snapshot();
    this.#world = [Kind.Then, this.#world, value];
    thenBlock(this);
    const snapshot1 = this.swap(snapshot0);
    this.#world = [Kind.Else, this.#world, value];
    elseBlock(this);
    if (snapshot1.continuation !== "next") {
      this.#snapshots.push(snapshot1);
      return;
    }
    if (this.#continuation === "next") {
      this.join(snapshot1);
    } else {
      this.#snapshots.push(this.swap(snapshot1));
    }
  }

  ifThenElse(
    condition: Expression,
    thenBlock: (_: Model) => void,
    elseBlock: (_: Model) => void,
  ): void {
    switch (condition.token.type) {
      case TokenType.AND: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(
          left,
          (it) => it.ifThenElse(right, thenBlock, elseBlock),
          elseBlock,
        );
      }
      case TokenType.BE: {
        const { left, right } = condition as Binary;
        return this.ifThenElse(right, (model) => {
          model.assign(condition.token, left, new Literal(right.token, true));
          return thenBlock(model);
        }, (model) => {
          model.assign(condition.token, left, new Literal(right.token, false));
          return elseBlock(model);
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
        const { value } = condition as Log;
        return this.ifThenElse(value, (model) => {
          model.#world = [Kind.Log, this.#world, [Kind.Literal, true]];
          return thenBlock(model);
        }, (model) => {
          model.#world = [Kind.Log, this.#world, [Kind.Literal, false]];
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
        return this.ifThenElse(
          left,
          thenBlock,
          (it) => it.ifThenElse(right, thenBlock, elseBlock),
        );
      }
      case TokenType.TRUE:
        return thenBlock(this);
      default:
        throw Model.#error(condition.token, "Illegal condition expression");
    }
  }
}
