import { RedBlackTreeMap } from "../redBlack2.ts";
import { Token, TokenType } from "./lexer.ts";
import {
  Access,
  Binary,
  Block,
  Call,
  Expression,
  IfStatement,
  Literal,
  Log,
  New,
  Not,
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
export type _Call = [Kind.Call, Value, Value[]];
export type Value =
  | _Call
  | [Kind.Access, Value, string]
  | Kind.Deleted
  | [Kind.Phi, Value[]]
  | [Kind.Literal, boolean | string]
  | [Kind.New, string]
  | [Kind.Comparison, TokenType, Value, Value]
  | Kind.Undefined
  | Kind.This;
export type Update =
  | _Call
  | [Kind.Return, Value]
  | [Kind.SetField, Value, string, Value]
  | [Kind.Then, Value]
  | [Kind.Else, Value]
  | [Kind.Log, Value];
export type World =
  | null
  | { type: "update"; previous: World; update: Update }
  | {
    type: "join";
    previous: World[];
  };

type Alternatives = { [_: string]: Model };

export class Model {
  world: World = null;
  values: RedBlackTreeMap<Value> = RedBlackTreeMap.EMPTY;

  clone(): Model {
    const that = new Model();
    that.world = this.world;
    that.values = this.values;
    return that;
  }

  #get(key: string): Value | undefined {
    return this.values.get(key);
  }

  #set(key: string, value: Value) {
    this.values = this.values.add(key, value);
  }

  #update(update: Update) {
    this.world = { type: "update", previous: this.world, update };
  }

  static #error(token: Token, msg: string) {
    return new Error(
      `Compile error at [${token.line},${token.column}]: ${msg}`,
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
        this.#update([Kind.SetField, a, field, b]);
        return b;
      }
      case TokenType.VAR: {
        const { key: { name } } = left as VarDeclaration;
        if (this.#get(name) !== undefined) {
          // no access to token, alas
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
        return [Kind.Access, this.value(object), field];
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
        const value = this.value(expression as Log);
        this.#update([Kind.Log, value]);
        return value;
      }
      case TokenType.NEW:
        return [Kind.New, (expression as New).klaz];
      case TokenType.PAREN_LEFT: {
        const { operator, operands } = expression as Call;
        const value: _Call = [
          Kind.Call,
          this.value(operator),
          operands.map(this.value),
        ];
        this.#update(value);
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
      default:
        throw new Error(
          "unexpected token type " + TokenType[expression.token.type],
        );
    }
  }

  #boolean(expression: Expression): Alternatives {
    switch (expression.token.type) {
      case TokenType.AND: {
        const { left, right } = expression as Binary;
        return this.ifThenElse(
          left,
          (it: Model) => it.#boolean(right),
          Model.#noop,
        );
      }
      case TokenType.BE: {
        const { left, right } = expression as Binary;
        return this.ifThenElse(right, (model) => {
          model.assign(expression.token, left, new Literal(right.token, true));
          return {};
        }, (model) => {
          model.assign(expression.token, left, new Literal(right.token, false));
          return {};
        });
      }
      case TokenType.DOT:
      case TokenType.FALSE:
      case TokenType.IDENTIFIER:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.NOT:
      case TokenType.TRUE:
        console.warn(
          `unused boolean statement at [${expression.token.line},${expression.token.column}]`,
        );
        return {};
      case TokenType.OR: {
        const { left, right } = expression as Binary;
        return this.ifThenElse(left, Model.#noop, (it) => it.#boolean(right));
      }
      case TokenType.LOG:
        this.#update([Kind.Log, this.value((expression as Log).value)]);
        return {};
      default:
        throw Model.#error(expression.token, "Illegal expression in boolean");
    }
  }

  static #noop: (_: Model) => Alternatives = (_) => ({});

  #block(block: Block): Alternatives {
    // todo
    throw Model.#error(block.token, "not implemented");
  }

  // no good
  interpret(statements: Statement[]): Alternatives {
    const alternatives: Alternatives = {};
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      switch (statement.token.type) {
        case TokenType.AND: {
          const { left, right } = statement as Binary;
          Model.mergeAlternatives(
            alternatives,
            this.ifThenElse(
              left,
              (it) => it.#boolean(right),
              Model.#noop,
            ),
          ); //???
          continue;
        }
        case TokenType.BRACE_LEFT: {
          // todo: delete variables out of scope
          Model.mergeAlternatives(
            alternatives,
            this.#block(
              statement as Block,
            ),
          );
          continue;
        }
        case TokenType.IF: {
          const { condition, onTrue, onFalse } = statement as IfStatement;
          Model.mergeAlternatives(
            alternatives,
            this.ifThenElse(
              condition,
              (it) => it.#block(onTrue),
              onFalse ? (it) => it.#block(onFalse) : Model.#noop,
            ),
          );
          continue;
        }
        case TokenType.DOT:
        case TokenType.FALSE:
        case TokenType.IDENTIFIER:
        case TokenType.IS_NOT:
        case TokenType.IS:
        case TokenType.LESS:
        case TokenType.MORE:
        case TokenType.NOT_LESS:
        case TokenType.NOT_MORE:
        case TokenType.NOT:
          // can expressions generate alternatives?
          this.#boolean(statement as Expression);
          continue;
        case TokenType.OR: {
          const { left, right } = statement as Binary;
          Model.mergeAlternatives(
            alternatives,
            this.ifThenElse(left, Model.#noop, (it) => it.#boolean(right)),
          );
          continue;
        }
        case TokenType.LOG:
        case TokenType.NEW:
        case TokenType.STRING:
        case TokenType.THIS:
        case TokenType.TRUE:
        case TokenType.VAR:
          this.value(statement as Expression);
          continue;
        // case TokenType.RETURN:
        // what!?
        case TokenType.WHILE: {
          const { condition, onTrue } = statement as WhileStatement;
          const head = (it: Model) =>
            it.ifThenElse(condition, (it: Model) => {
              const alt = it.#block(onTrue);
              // todo: process alternatives
              head(it);
              return alt;
            }, Model.#noop);
          head(this);
        }
      }
    }
    return alternatives;
  }

  // expensive and unproven
  merge(that: Model) {
    if (this.world !== that?.world) {
      this.world = {
        type: "join",
        previous: [this.world, that.world],
      };
    }

    // no adjustment of values if that is not defined?
    // what are we recording anyway?
    for (const [k, v] of this.values.entries()) {
      const w = that.#get(k);
      if (w === undefined || w === Kind.Deleted || w === v) {
        continue;
      }
      this.#set(k, [Kind.Phi, [w, v]]);
    }

    for (const [k, v] of that.values.entries()) {
      const u = this.#get(k);
      if (u === undefined || u === Kind.Deleted) {
        this.#set(k, v);
      }
    }
  }

  static mergeAlternatives(
    these: Alternatives,
    those: Alternatives,
  ) {
    for (const [k, v] of Object.entries(these)) {
      if (those[k]) v.merge(those[k]);
    }
    for (const [k, v] of Object.entries(those)) {
      if (these[k]) continue;
      these[k] = v;
    }
  }

  __ifThenElse(
    condition: Expression,
    thenBlock: (_: Model) => Alternatives,
    elseBlock: (_: Model) => Alternatives,
  ): Alternatives {
    const value = this.value(condition);
    const that = this.clone();
    this.#update([Kind.Then, value]);
    that.#update([Kind.Else, value]);
    const a = thenBlock(this);
    const b = elseBlock(that);
    this.merge(that);
    Model.mergeAlternatives(a, b);
    return a;
  }

  ifThenElse(
    condition: Expression,
    thenBlock: (_: Model) => Alternatives,
    elseBlock: (_: Model) => Alternatives,
  ): Alternatives {
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
          model.#update([Kind.Log, [Kind.Literal, true]]);
          return thenBlock(model);
        }, (model) => {
          model.#update([Kind.Log, [Kind.Literal, false]]);
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
