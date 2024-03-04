import { Class, Instruction, Label, Method, Op } from "./class.ts";
import { Token, TokenType } from "./lexer.ts";
import {
  Access,
  Binary,
  Block,
  Break,
  Call,
  ClassDeclaration,
  Continue,
  Expression,
  IfStatement,
  Jump,
  Literal,
  Log,
  MethodDeclaration,
  New,
  Not,
  Return,
  Statement,
  VarDeclaration,
  Variable,
  WhileStatement,
} from "./parser.ts";

type Local = {
  variable: Variable;
  register?: number;
};

type NamedLabel = {
  name?: string;
  break: Label;
  continue: Label;
};

type TypedLabel = {
  label: Label;
  written: Set<Local>;
};

type Register = {
  index: number;
  owned?: boolean;
};

export class Compiler {
  #size = 0;
  #freeRegisters: number[] = [];
  #current: TypedLabel = { label: new Label(), written: new Set() };
  #locals: Local[] = [];
  #names: NamedLabel[] = [];

  constructor(private readonly classes: Record<string, Class> = {}) {}

  #emit(...instructions: Instruction[]) {
    this.#current.label.instructions.push(
      ...instructions,
    );
  }

  #error(token: Token, msg: string) {
    return new Error(
      `Compile error at [${token.line},${token.column}]: ${msg}`,
    );
  }

  #allocate(): number {
    return this.#freeRegisters.pop() ?? this.#size++;
  }

  #repay(...registers: Register[]) {
    for (const register of registers) {
      if (!register.owned) this.#freeRegisters.push(register.index);
    }
  }

  #local(name: string): Local | null {
    for (let i = this.#locals.length - 1; i >= 0; i--) {
      if (this.#locals[i].variable.name === name) {
        return this.#locals[i];
      }
    }
    return null;
  }

  #resolve(variable: Variable): Local {
    const local = this.#local(variable.name);
    if (local === null) {
      throw this.#error(
        variable.token,
        `Undeclared variable '${variable.name}'`,
      );
    }
    return local;
  }

  #hasAssigned(local: Local) {
    return this.#current.written.has(local);
  }

  #getRegister(variable: Variable): Register {
    const local = this.#resolve(variable);
    if (local.register === undefined || !this.#hasAssigned(local)) {
      throw this.#error(
        variable.token,
        `Variable '${variable.name}' read before written`,
      );
    }
    return { index: local.register, owned: true };
  }

  #next() {
    return this.#current.label.next;
  }

  #goto(label: Label) {
    const written = new Set(this.#current.written);
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

  #booleanBinary(
    expression: Binary,
    onFalse: Label,
  ) {
    const a = Compiler.#BOOL_BI[expression.token.type];
    if (a) {
      const [op, negate, reverse] = a;
      const target = negate ? this.#switch(onFalse) : onFalse;
      const reg1 = this.#expression(expression.left);
      const reg2 = this.#expression(expression.right);
      this.#emit(
        reverse
          ? [op, target, reg2.index, reg1.index]
          : [op, target, reg1.index, reg2.index],
      );
      this.#repay(reg1, reg2);
      return;
    }

    switch (expression.token.type) {
      case TokenType.AND: {
        this.#boolean(expression.left, onFalse);
        const b = new Label(this.#next());
        this.#current.label.next = b;
        this.#goto(b);
        this.#boolean(expression.right, onFalse);
        return;
      }
      case TokenType.OR: {
        const b = new Label(this.#next());
        this.#boolean(expression.left, b);
        this.#goto(b);
        this.#boolean(expression.right, onFalse);
        return;
      }
      case TokenType.BE: {
        const reg = this.#assignment(expression);
        this.#emit([Op.JumpIfFalse, onFalse, reg.index]);
        this.#repay(reg);
        return;
      }
      default:
        throw this.#error(expression.token, "Malformed boolean expression");
    }
  }

  #switch(onFalse: Label): Label {
    const next = this.#current.label.next || new Label();
    this.#current.label.next = onFalse;
    return next;
  }

  #boolean(
    expression: Expression,
    onFalse: Label,
  ) {
    switch (expression.constructor) {
      case Access: {
        const reg = this.#expression(expression);
        this.#emit([
          Op.JumpIfFalse,
          onFalse,
          reg.index,
        ]);
        this.#repay(reg);
        return;
      }
      case Binary:
        this.#booleanBinary(expression as Binary, onFalse);
        return;
      case Literal: {
        const { token, value } = expression as Literal;
        switch (value) {
          case true:
            return;
          case false:
            this.#current.label.next = onFalse;
            return;
          default:
            throw this.#error(token, 'expected "true" or "false".');
        }
      }
      case Not: {
        this.#boolean(
          (expression as Not).expression,
          this.#switch(onFalse),
        );
        return;
      }
      case Variable: {
        const reg = this.#getRegister(expression as Variable);
        this.#emit([
          Op.JumpIfFalse,
          onFalse,
          reg.index,
        ]);
        return;
      }
      default:
        throw this.#error(expression.token, "Expected boolean");
    }
  }

  #assignment(assignment: Binary): Register {
    if (assignment.left instanceof Variable) {
      const local = this.#resolve(assignment.left);
      const r1 = this.#expression(assignment.right);
      if (local.register === undefined && !r1.owned) {
        local.register = r1.index;
        r1.owned = true;
      } else {
        this.#emit([
          Op.Move,
          local.register ??= this.#allocate(),
          r1.index,
        ]);
      }
      this.#current.written?.add(
        local,
      );
      return r1;
    }

    if (assignment.left instanceof VarDeclaration) {
      const r1 = this.#expression(assignment.right);
      let index: number;
      if (r1.owned) {
        index = this.#allocate();
        this.#emit([
          Op.Move,
          index,
          r1.index,
        ]);
      } else {
        index = r1.index;
      }
      const local = this.#declare(assignment.left.key, index);
      this.#current.written.add(local);
      return { index, owned: true };
    }

    if (assignment.left instanceof Access) {
      // calculate results, store in register 1
      const register1 = this.#expression(assignment.left.object);
      // now calculate the right hand side and store in register 2
      const register2 = this.#expression(assignment.right);
      // move the result to the heap
      this.#emit([
        Op.SetField,
        register1.index,
        assignment.left.field,
        register2.index,
      ]);
      this.#repay(register1);
      return register2;
    }

    throw this.#error(
      assignment.token,
      "Unsupported assignment right hand side",
    );
  }

  #binary(expression: Binary): Register {
    switch (expression.token.type) {
      case TokenType.BE:
        return this.#assignment(expression);
      case TokenType.AND:
      case TokenType.IS_NOT:
      case TokenType.IS:
      case TokenType.LESS:
      case TokenType.MORE:
      case TokenType.NOT_LESS:
      case TokenType.NOT_MORE:
      case TokenType.OR: {
        const continuation = new Label(this.#next());
        const falseBranch = new Label(continuation);
        this.#current.label.next = continuation;
        const index = this.#allocate();
        this.#emit([Op.Constant, index, true]);
        this.#booleanBinary(expression, falseBranch);
        this.#goto(falseBranch);
        this.#emit([Op.Constant, index, false]);
        this.#goto(continuation);
        return { index };
      }
      default:
        throw this.#error(
          expression.token,
          "Unsupported operation",
        );
    }
  }

  #call(call: Call): Register {
    if (call.operator instanceof Access) {
      const args = [call.operator.object, ...call.operands].map((it) =>
        this.#expression(it)
      );
      this.#emit([
        Op.InvokeVirtual,
        call.operator.field,
        args.map((it) => it.index),
      ]);
      args.forEach((it) => this.#repay(it));
      const index = this.#allocate();
      this.#emit([Op.MoveResult, index]);
      return { index };
    }
    throw this.#error(call.token, "uncallable operand");
  }

  #expression(
    expression: Expression,
  ): Register {
    switch (expression.constructor) {
      case Literal: {
        const index = this.#allocate();
        this.#emit([
          Op.Constant,
          index,
          (expression as Literal).value,
        ]);
        return { index };
      }
      case Log: {
        // type checking might make sense for 'print'
        // need print now to inspect memory
        const register = this.#expression((expression as Log).value);
        this.#emit([Op.Log, register.index]);
        return register;
      }
      case New: {
        const { klaz, operands } = expression as New;
        const index = this.#allocate();
        this.#emit([
          Op.New,
          index,
          this.classes[klaz] ||= new Class(),
        ]);
        const args = operands.map((it) => this.#expression(it));
        this.#emit([
          Op.InvokeStatic,
          this.classes[klaz].method("new"),
          [index, ...args.map((it) => it.index)],
        ]);
        args.forEach((it) => this.#repay(it));
        return { index };
      }
      case Call:
        return this.#call(expression as Call);
      case Binary:
        return this.#binary(expression as Binary);
      case Variable:
        return this.#getRegister(expression as Variable);
      case Access: {
        const register = this.#expression(
          (expression as Access).object,
        );
        const index = this.#allocate();
        this.#emit([
          Op.GetField,
          index,
          register.index,
          (expression as Access).field,
        ]);
        this.#repay(register);
        return { index };
      }
      case VarDeclaration: {
        const index = this.#allocate();
        this.#declare(
          (expression as VarDeclaration).key,
          index,
        );
        return { index, owned: true };
      }
      default:
        throw this.#error(expression.token, "Unexpected expression type");
    }
  }

  #checkAvailability(variable: Variable) {
    const resolve = this.#local(variable.name);
    if (resolve !== null) {
      throw this.#error(
        variable.token,
        `Variable '${variable.name}' already in scope since [${resolve.variable.token.line},${resolve.variable.token.column}]`,
      );
    }
  }

  #declare(variable: Variable, register: number): Local {
    this.#checkAvailability(variable);
    const local = { variable, register };
    this.#locals.push(local);
    return local;
  }

  #class(declaration: ClassDeclaration) {
    const klaz = this.classes[declaration.name.name] ||= new Class();
    for (const methodDeclaration of declaration.methods) {
      Compiler.#method(
        methodDeclaration,
        this.classes,
        klaz.method(methodDeclaration.name.name),
      );
    }
  }

  static #method(
    declaration: MethodDeclaration,
    classes: Record<string, Class>,
    method: Method,
  ) {
    method.arity = declaration.args.length;
    const compiler = new Compiler(classes);
    method.start = compiler.#current.label;
    compiler.#current.written.add(compiler.#declare(
      new Variable(declaration.token, "this"),
      compiler.#allocate(),
    ));
    for (const variable of declaration.args) {
      compiler.#current.written.add(
        compiler.#declare(variable, compiler.#allocate()),
      );
    }
    compiler.#block(declaration.body);
    method.size = compiler.#size;
  }

  #block(block: Block) {
    const depth = this.#locals.length;
    for (const statement of block.statements) {
      this.#statement(statement);
    }
    if (block.jump) {
      this.#jump(block.jump);
    }
    while (this.#locals.length > depth) {
      const register = this.#locals.pop()?.register;
      if (register !== undefined) this.#freeRegisters.push(register);
    }
  }

  #getNamedLabel(token: Token, name?: string): NamedLabel {
    if (name === undefined) {
      if (this.#names.length > 0) return this.#names[this.#names.length - 1];
    } else {
      for (let i = this.#names.length - 1; i >= 0; i--) {
        if (this.#names[i].name === name) {
          return this.#names[i];
        }
      }
    }
    throw this.#error(token, `Target ${name} not found`);
  }

  #jump(statement: Jump) {
    switch (statement.constructor) {
      case Break:
        this.#current.label.next =
          this.#getNamedLabel(statement.token, (statement as Break).label)
            .break;
        return;
      case Continue:
        this.#current.label.next =
          this.#getNamedLabel(statement.token, (statement as Continue).label)
            .continue;
        return;
      case Return: {
        const e = (statement as Return).expression;
        delete this.#current.label.next;
        if (e === undefined) return;
        const reg = this.#expression(e);
        this.#emit([Op.Return, reg.index]);
        this.#repay(reg);
        return;
      }
      default:
        throw this.#error(statement.token, "Bad end of block");
    }
  }

  // not good enough?
  #statement(statement: Statement) {
    switch (statement.constructor) {
      case Block:
        this.#block(statement as Block);
        return;
      case IfStatement: {
        const { condition, onFalse, onTrue } = statement as IfStatement;
        const continuation = new Label(this.#next());
        const thenBranch = new Label(continuation);
        const elseBranch = new Label(continuation);
        this.#current.label.next = thenBranch;
        this.#boolean(condition, elseBranch);
        // record assignments for the else branch
        const we = new Set(
          this.#current.written,
        );
        this.#goto(thenBranch);
        this.#block(onTrue);
        // record assignment after for continuation
        const assignedOnTrue = [
          ...this.#current.written,
        ];
        this.#current = { label: elseBranch, written: we };
        if (onFalse) {
          this.#block(onFalse);
        }
        // combine
        this.#current = {
          label: continuation,
          written: new Set(
            [...this.#current.written].filter((it) =>
              assignedOnTrue.includes(it)
            ),
          ),
        };
        return;
      }
      case WhileStatement: {
        const { condition, onTrue, label } = statement as WhileStatement;
        const continuation = new Label(this.#next());
        const loopA = new Label(this.#next());
        const loopB = new Label(loopA);
        this.#current.label.next = loopA;
        loopA.next = loopB;

        this.#goto(loopA);
        this.#boolean(condition, continuation);
        const written = new Set(
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
      default:
        this.#repay(this.#expression(statement as Expression));
        return;
    }
  }

  compile(script: (Block | ClassDeclaration)[]): Method {
    const method = new Method();
    method.start = this.#current.label;
    for (const line of script) {
      if (line instanceof Block) {
        this.#block(line);
      } else {
        this.#class(line);
      }
    }
    Compiler.mergeLabels(method.start);
    method.size = this.#size;
    return method;
  }

  static mergeLabels(start: Label) {
    // collect all labels.
    const labels = [start];
    for (let i = 0; i < labels.length; i++) {
      while (labels[i].next?.instructions?.length === 0) {
        labels[i].next = labels[i].next?.next;
      }
      const next = labels[i].next;
      if (next && !labels.includes(next)) labels.push(next);

      for (const ins of [...labels[i].instructions]) {
        switch (ins[0]) {
          case Op.JumpIfLess:
          case Op.JumpIfEqual:
          case Op.JumpIfFalse:
            break;
          default:
            continue;
        }
        // eliminate the empty labels
        while (ins[1].instructions.length === 0) {
          if (ins[1].next) {
            ins[1] = ins[1].next;
          }
        }
        if (ins[1] && !labels.includes(ins[1])) labels.push(ins[1]);
      }
    }
  }
}
