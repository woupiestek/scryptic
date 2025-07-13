import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import {
  Class,
  Instruction,
  Label,
  Labels,
  Method,
  NULL_LABEL,
  Op,
} from "./class.ts";
import { TokenType } from "./lex.ts";
import { NodeType, Parse } from "./parse.ts";
import { UIntSet } from "../collections/uintset.ts";

type NamedLabel = {
  name?: string;
  break: Label;
  continue: Label;
};

type TypedLabel = {
  label: Label;
  written: UIntSet;
};

type Register = number & { readonly __tag: unique symbol };

type Local = number & { readonly __tag: unique symbol };

// removed ownership logic, which means more registers are needed now
class Locals {
  #minFree = 0;
  #occupied = new UIntSet();

  alloc() {
    while (this.#occupied.has(this.#minFree)) {
      this.#minFree++;
    }
    this.#occupied.add(this.#minFree);
    return this.#minFree++ as Register;
  }

  free(register: Register) {
    this.#occupied.remove(register);
    if (register < this.#minFree) {
      this.#minFree = register;
    }
  }

  #names: string[] = [];
  #registers: Register[] = [];
  size = 0;
  static #EMPTY = -1 as Register;

  add(name: string, register: Register = Locals.#EMPTY): Local {
    this.#names[this.size] = name;
    this.#registers[this.size] = register;
    return this.size++ as Local;
  }

  register(i: Local, j?: Register): Register {
    if (j !== undefined) {
      this.#registers[i] = j;
    }
    return this.#registers[i];
  }

  resolve(name: string): Local {
    let i = this.size - 1;
    for (; i >= 0; i--) {
      if (this.#names[i] === name) {
        break;
      }
    }
    return i as Local;
  }

  truncate(size: number) {
    while (this.size > size) {
      this.size--;
      if (this.#registers[this.size] >= 0) {
        this.free(this.#registers[this.size]);
      }
    }
  }
}

export class Compiler {
  labels = new Labels();
  #current: TypedLabel = { label: this.labels.label(), written: new UIntSet() };
  #names: NamedLabel[] = [];
  #locals = new Locals();

  constructor(
    private readonly parse: Parse,
    private readonly classes: Record<string, Class> = {},
  ) {
    this.#compile();
  }

  #emit(...instructions: Instruction[]) {
    this.labels.instructions(
      this.#current.label,
    ).push(
      ...instructions,
    );
  }

  #error(node: number, msg: string) {
    const [l, c] = this.parse.lex.lineAndColumn(this.parse.tokens[node]);
    return new Error(
      `Compile error at [${l}:${c}:${NodeType[this.parse.types[node]]}:${
        TokenType[this.#tokenType(node)]
      }]: ${msg}`,
    );
  }

  // probably doesn't work well without 'owned' logic
  #repay(...registers: Register[]) {
    for (const register of registers) {
      this.#locals.free(register);
    }
  }

  #lexeme(nodeNumber: number) {
    return this.parse.lex.lexeme(this.parse.tokens[nodeNumber]);
  }

  #resolve(variable: number): Local {
    const name = this.#lexeme(variable);
    const local = this.#locals.resolve(name);
    if (local === -1) {
      throw this.#error(
        variable,
        `Undeclared variable '${name}'`,
      );
    }
    return local;
  }

  #hasAssigned(local: number) {
    return this.#current.written.has(local);
  }

  #getRegister(variable: number): Register {
    const index = this.#resolve(variable);
    if (index === -1 || !this.#hasAssigned(index)) {
      throw this.#error(
        variable,
        `Variable '${this.#lexeme(variable)}' read before written`,
      );
    }
    return this.#locals.register(index);
  }

  #getThis(node: number) {
    const index = this.#locals.resolve("this");
    if (index === -1) {
      throw this.#error(node, '"this" outside of class');
    }
    return this.#locals.register(index);
  }

  #next() {
    return this.labels.next(this.#current.label);
  }

  #goto(label: Label) {
    const written = new UIntSet(this.#current.written);
    this.#current = {
      label,
      written,
    };
  }

  static #BOOL_BI: [number, boolean, boolean][] = [];
  static {
    Compiler.#BOOL_BI[TokenType.IS] = [Op.JumpIfEqual, true, false];
    Compiler.#BOOL_BI[TokenType.IS_NOT] = [Op.JumpIfEqual, false, false];
    Compiler.#BOOL_BI[TokenType.LESS] = [Op.JumpIfLess, false, true];
    Compiler.#BOOL_BI[TokenType.MORE] = [Op.JumpIfLess, true, true];
    Compiler.#BOOL_BI[TokenType.NOT_LESS] = [Op.JumpIfLess, false, false];
    Compiler.#BOOL_BI[TokenType.NOT_MORE] = [Op.JumpIfLess, true, false];
  }

  #tokenType(node: number) {
    return this.parse.lex.types[this.parse.tokens[node]];
  }

  #booleanBinary(
    x: number[],
    y: number,
    onFalse: Label,
  ) {
    const a = Compiler.#BOOL_BI[this.#tokenType(y)];
    if (a) {
      const [op, negate, reverse] = a;
      const target = negate ? this.#switch(onFalse) : onFalse;
      const reg1 = this.#expression(x);
      const reg2 = this.#expression(this.#children(y).toArray());
      this.#emit(
        reverse ? [op, target, reg2, reg1] : [op, target, reg1, reg2],
      );
      this.#repay(reg1, reg2);
      return;
    }

    switch (this.#tokenType(y)) {
      case TokenType.AND: {
        this.#boolean(x, onFalse);
        const b = this.labels.label(this.#next());
        this.labels.next(this.#current.label, b);
        this.#goto(b);
        this.#boolean(this.#children(y).toArray(), onFalse);
        return;
      }
      case TokenType.OR: {
        const b = this.labels.label(this.#next());
        this.#boolean(x, b);
        this.#goto(b);
        this.#boolean(this.#children(y).toArray(), onFalse);
        return;
      }
      case TokenType.BE: {
        const reg = this.#assignment(x, y);
        this.#emit([Op.JumpIfFalse, onFalse, reg]);
        this.#repay(reg);
        return;
      }
      default:
        throw this.#error(
          y,
          "Malformed boolean expression",
        );
    }
  }

  #switch(onFalse: Label): Label {
    const next = this.labels.next(this.#current.label, onFalse);
    return next === -1 ? this.labels.label() : next;
  }

  #boolean(
    expression: number[],
    onFalse: Label,
  ) {
    const node = expression.pop();
    assert(typeof node === "number");
    switch (this.#tokenType(node)) {
      case TokenType.PAREN_LEFT:
        // asume parenthetical
        this.#boolean(this.#children(node).toArray(), onFalse);
        return;
      case TokenType.DOT: {
        const reg = this.#expression(expression);
        this.#emit([
          Op.JumpIfFalse,
          onFalse,
          reg,
        ]);
        this.#repay(reg);
        return;
      }
      case TokenType.AND:
      case TokenType.BE:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR:
        this.#booleanBinary(expression, node, onFalse);
        return;
      case TokenType.TRUE:
        return;
      case TokenType.FALSE:
        this.labels.next(this.#current.label, onFalse);
        return;
      case TokenType.NOT: {
        this.#boolean(
          this.#children(node).toArray(),
          this.#switch(onFalse),
        );
        return;
      }
      case TokenType.IDENTIFIER: {
        this.#emit([
          Op.JumpIfFalse,
          onFalse,
          this.#getRegister(node),
        ]);
        return;
      }
      case TokenType.THIS: {
        this.#emit([
          Op.JumpIfFalse,
          onFalse,
          this.#getThis(node),
        ]);
        return;
      }
      default:
        throw this.#error(node, "Expected boolean");
    }
  }

  #assignment(x: number[], y: number): Register {
    const left = x.pop();
    assert(typeof left === "number");
    const tokenType = this.#tokenType(left);
    if (tokenType === TokenType.IDENTIFIER) {
      const local = this.#resolve(left);
      const r1 = this.#expression(this.#children(y).toArray());
      if (this.#locals.register(local) === -1) {
        this.#locals.register(local, r1);
      } else {
        this.#emit([
          Op.Move,
          this.#locals.register(local),
          r1,
        ]);
      }
      this.#current.written.add(
        local,
      );
      return r1;
    }

    if (tokenType === TokenType.VAR) {
      const r1 = this.#expression(this.#children(y).toArray());
      const index = this.#locals.alloc();
      this.#emit([
        Op.Move,
        index,
        r1,
      ]);

      this.#current.written.add(this.#declare(left + 1, index));
      return index;
    }

    if (tokenType === TokenType.DOT) {
      // calculate object store in register 1
      const register1 = this.#expression(x);
      // now calculate the right hand side and store in register 2
      const register2 = this.#expression(this.#children(y).toArray());
      // move the result to the heap
      this.#emit([
        Op.SetField,
        register1,
        this.#lexeme(left + 1), // the name of the field!
        register2,
      ]);
      this.#repay(register1);
      return register2;
    }

    throw this.#error(
      left,
      "Unsupported assignment right hand side",
    );
  }

  #binary(lhs: number[], rest: number): Register {
    switch (this.#tokenType(rest)) {
      case TokenType.BE:
      case TokenType.AND:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR: {
        const continuation = this.labels.label(this.#next());
        const falseBranch = this.labels.label(continuation);
        this.labels.next(this.#current.label, continuation);
        const index = this.#locals.alloc();
        this.#emit([Op.Constant, index, true]);
        this.#booleanBinary(lhs, rest, falseBranch);
        this.#goto(falseBranch);
        this.#emit([Op.Constant, index, false]);
        this.#goto(continuation);
        return index;
      }
      default:
        throw this.#error(
          rest,
          "Unsupported operation",
        );
    }
  }

  #call(operator: number[], operands: number): Register {
    const node = operator.pop();
    assert(typeof node === "number");
    if (this.#tokenType(node) === TokenType.DOT) {
      const args = [
        this.#expression(operator),
      ];
      const children = [...this.#children(operands)];
      if (children.length > 0) args.push(this.#expression(children));
      // what about multiple parameters?
      this.#emit([
        Op.InvokeVirtual,
        this.#lexeme(node + 1),
        args,
      ]);
      // args.forEach((it) => this.#repay(it));
      const index = this.#locals.alloc();
      this.#emit([Op.MoveResult, index]);
      return index;
    }
    if (this.#tokenType(node) === TokenType.NEW) {
      const index = this.#locals.alloc();
      const klaz = this.#lexeme(node + 1);
      this.#emit([
        Op.New,
        index,
        this.classes[klaz] ||= new Class(),
      ]);

      const args = [index];
      const children = [...this.#children(operands)];
      if (children.length) args.push(this.#expression(children));
      this.#emit([
        Op.InvokeStatic,
        this.classes[klaz].method("new", this.labels),
        args,
      ]);
      // args.forEach((it) => this.#repay(it));
      return index;
    }
    throw this.#error(node, "uncallable operand");
  }

  #expression(
    nodes: number[],
  ): Register {
    const node = nodes.pop();
    assert(typeof node === "number");
    switch (this.#tokenType(node)) {
      case TokenType.TRUE: {
        const index = this.#locals.alloc();
        this.#emit([
          Op.Constant,
          index,
          true,
        ]);
        return index;
      }
      case TokenType.FALSE: {
        const index = this.#locals.alloc();
        this.#emit([
          Op.Constant,
          index,
          false,
        ]);
        return index;
      }
      case TokenType.STRING: {
        const index = this.#locals.alloc();
        this.#emit([
          Op.Constant,
          index,
          JSON.parse(this.#lexeme(node)),
        ]);
        return index;
      }
      case TokenType.LOG: {
        // type checking might make sense for 'print'
        // need print now to inspect memory
        const register = this.#expression(this.#children(node).toArray());
        this.#emit([Op.Log, register]);
        return register;
      }
      case TokenType.PAREN_LEFT:
        // could just be a parens, alas
        if (nodes.length === 0) {
          return this.#expression(this.#children(node).toArray());
        } else return this.#call(nodes, node);
      case TokenType.BE:
        return this.#assignment(nodes, node);
      case TokenType.AND:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR:
        return this.#binary(nodes, node);
      case TokenType.IDENTIFIER:
        return this.#getRegister(node);
      case TokenType.THIS:
        return this.#getThis(node);
      case TokenType.DOT: {
        const register = this.#expression(
          nodes,
        );
        const index = this.#locals.alloc();
        this.#emit([
          Op.GetField,
          index,
          register,
          this.#lexeme(node + 1),
        ]);
        this.#repay(register);
        return index;
      }
      case TokenType.VAR: {
        const index = this.#locals.alloc();
        this.#declare(
          node + 1,
          index,
        );
        return index;
      }
      default:
        throw this.#error(
          node,
          "Unexpected expression type",
        );
    }
  }

  #declare(variable: number, register: Register): Local {
    const name = this.#lexeme(variable);
    const resolve = this.#locals.resolve(name);
    if (resolve !== -1) {
      const [l, c] = this.parse.lex.lineAndColumn(this.parse.tokens[variable]);
      throw this.#error(
        variable,
        `Variable '${name}' already in scope since [${l}:${c}]`,
      );
    }
    return this.#locals.add(this.#lexeme(variable), register);
  }

  *#children(node: number) {
    for (
      let i = node + 1;
      i < node + this.parse.sizes[node];
      i += this.parse.sizes[i]
    ) {
      yield i;
    }
  }

  #class(declaration: number) {
    const [h, ...t] = this.#children(declaration);
    const klaz = this.classes[this.#lexeme(h)] ||= new Class();
    const _this = this.#locals.add("this", this.#locals.alloc());
    for (const methodDeclaration of t) {
      this.#method(
        methodDeclaration,
        klaz.method(this.#lexeme(methodDeclaration), this.labels),
      );
    }
    this.#locals.truncate(_this);
  }

  #method(
    declaration: number,
    method: Method,
  ) {
    assert(this.parse.types[declaration] === NodeType.METHOD);
    const args = [...this.#children(declaration)];
    const block = args.pop() ?? -1;
    method.arity = args.length;
    const current = this.#current;
    this.#current = {
      label: method.start,
      written: new UIntSet(this.#current.written),
    };
    for (const variable of args) {
      this.#current.written.add(
        this.#declare(variable, this.#locals.alloc()),
      );
    }
    this.#block(block);
    method.size = this.#locals.size;
    this.#current = current;
  }

  #block(block: number) {
    assert(this.parse.types[block] === NodeType.BLOCK);
    const size = this.#locals.size;
    for (const statement of this.#children(block)) {
      if (this.parse.types[statement] === NodeType.STMT) {
        this.#statement(statement);
      } else if (this.parse.types[statement] === NodeType.JUMP) {
        this.#jump(statement);
      }
    }
    this.#locals.truncate(size);
  }

  #getNamedLabel(node: number, name?: string): NamedLabel {
    if (name === undefined) {
      if (this.#names.length > 0) return this.#names[this.#names.length - 1];
    } else {
      for (let i = this.#names.length - 1; i >= 0; i--) {
        if (this.#names[i].name === name) {
          return this.#names[i];
        }
      }
    }
    throw this.#error(node, `Target ${name} not found`);
  }

  #label(node: number) {
    if (this.#tokenType(node) === TokenType.LABEL) {
      return this.#lexeme(node);
    }
    return undefined;
  }

  #jump(statement: number) {
    assert(this.parse.types[statement] === NodeType.JUMP);
    switch (this.#tokenType(statement)) {
      case TokenType.BREAK:
        this.labels.next(
          this.#current.label,
          this.#getNamedLabel(
            statement,
            this.#label(statement),
          )
            .break,
        );
        return;
      case TokenType.CONTINUE:
        this.labels.next(
          this.#current.label,
          this.#getNamedLabel(
            statement,
            this.#label(statement),
          )
            .continue,
        );
        return;
      case TokenType.RETURN: {
        this.labels.next(this.#current.label, NULL_LABEL);
        if (this.parse.sizes[statement] === 1) return;
        const reg = this.#expression(this.#children(statement + 1).toArray());
        this.#emit([Op.Return, reg]);
        this.#repay(reg);
        return;
      }
      default:
        throw this.#error(statement, "Bad end of block");
    }
  }

  #statement(statement: number) {
    switch (this.#tokenType(statement)) {
      case TokenType.BRACE_LEFT:
        this.#block(statement + 1);
        return;
      case TokenType.IF: {
        const [condition, onTrue, onFalse] = this.#children(statement + 1);
        const continuation = this.labels.label(this.#next());
        const thenBranch = this.labels.label(continuation);
        const elseBranch = this.labels.label(continuation);
        this.labels.next(this.#current.label, thenBranch);
        this.#boolean(this.#children(condition).toArray(), elseBranch);
        // record assignments for the else branch
        const we = new UIntSet(
          this.#current.written,
        );
        this.#goto(thenBranch);
        this.#block(onTrue);
        // record assignment after for continuation
        const assignedOnTrue = [...this.#current.written];
        this.#current = { label: elseBranch, written: we };
        if (onFalse) {
          this.#block(onFalse);
        }
        // combine
        this.#current = {
          label: continuation,
          written: new UIntSet(
            [...this.#current.written].filter((it) =>
              assignedOnTrue.includes(it)
            ),
          ),
        };
        return;
      }
      // similar needed for label
      case TokenType.WHILE: {
        const [condition, onTrue] = this.#children(statement + 1);
        const continuation = this.labels.label(this.#next());
        const loopA = this.labels.label(this.#next());
        const loopB = this.labels.label(loopA);
        this.labels.next(this.#current.label, loopA);
        this.labels.next(loopA, loopB);

        this.#goto(loopA);
        this.#boolean(this.#children(condition).toArray(), continuation);
        const written = new UIntSet(
          this.#current.written,
        );
        this.#goto(loopB);
        this.#names.push({
          break: continuation,
          continue: loopA,
        });
        this.#block(onTrue);
        this.#names.pop();
        this.#current = { label: continuation, written };
        return;
      }
      // similar needed for label
      case TokenType.LABEL: {
        const label = this.#lexeme(statement);
        const [condition, onTrue] = this.#children(statement + 1);
        const continuation = this.labels.label(this.#next());
        const loopA = this.labels.label(this.#next());
        const loopB = this.labels.label(loopA);
        this.labels.next(this.#current.label, loopA);
        this.labels.next(loopA, loopB);
        this.#goto(loopA);
        this.#boolean(this.#children(condition).toArray(), continuation);
        const written = new UIntSet(
          this.#current.written,
        );
        this.#goto(loopB);
        this.#names.push({
          name: label,
          break: continuation,
          continue: loopA,
        });
        this.#block(onTrue);
        this.#names.pop();
        this.#current = { label: continuation, written };
        return;
      }
      case TokenType.BREAK:
      case TokenType.CONTINUE:
      case TokenType.RETURN:
        this.#jump(statement + 1);
        return;
      default:
        this.#expression(this.#children(statement + 1).toArray());
        return;
    }
  }

  method = new Method(this.labels);

  #compile() {
    this.method.start = this.#current.label;
    for (let i = 0; i < this.parse.size; i += this.parse.sizes[i]) {
      switch (this.parse.types[i]) {
        case NodeType.CLASS:
          this.#class(i);
          break;
        case NodeType.STMT:
          this.#statement(i);
          break;
        default:
          throw this.#error(
            i,
            `Expected statement or class declaration, but found ${
              NodeType[this.parse.types[i]]
            }`,
          );
      }
    }
    this.labels.merge();
    this.method.size = this.#locals.size;
  }
}
