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
  LiteralBoolean,
  LiteralString,
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

  #booleanBinary(
    expression: Binary,
    onFalse: Label,
  ) {
    switch (expression.token.type) {
      case TokenType.AND: {
        this.#boolean(expression.left, onFalse);
        const b = new Label(this.#next());
        this.#current.label.next = b;
        this.#goto(b);
        this.#boolean(expression.right, onFalse);
        return;
      }
      case TokenType.IS_NOT: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([Op.JumpIfEqual, onFalse, reg1.index, reg2.index]);
        this.#repay(reg1, reg2);
        return;
      }
      case TokenType.IS: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([
          Op.JumpIfDifferent,
          onFalse,
          reg1.index,
          reg2.index,
        ]);
        this.#repay(reg1, reg2);
        return;
      }
      case TokenType.LESS: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit(
          // note: changed register ordering!
          [Op.JumpIfNotMore, onFalse, reg2.index, reg1.index],
        );
        this.#repay(reg1, reg2);
        return;
      }
      case TokenType.MORE: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([Op.JumpIfNotMore, onFalse, reg1.index, reg2.index]);
        this.#repay(reg1, reg2);
        return;
      }
      case TokenType.NOT_LESS: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit([Op.JumpIfLess, onFalse, reg1.index, reg2.index]);
        this.#repay(reg1, reg2);
        return;
      }
      case TokenType.NOT_MORE: {
        const reg1 = this.#expression(expression.left);
        const reg2 = this.#expression(expression.right);
        this.#emit(
          // note: changed register ordering!
          [Op.JumpIfLess, onFalse, reg2.index, reg1.index],
        );
        this.#repay(reg1, reg2);
        return;
      }
      case TokenType.OR: {
        const b = new Label(this.#next());
        this.#boolean(expression.left, b);
        this.#goto(b);
        this.#boolean(expression.right, onFalse);
        return;
      }
      case TokenType.BE: //when everthing is an expression, but then we must take care of partial assignments everywhere as well
      {
        const reg = this.#assignment(expression);
        this.#emit([Op.JumpIfFalse, onFalse, reg.index]);
        this.#repay(reg);
        return;
      }
      // later perhaps
      // case TokenType.SEMICOLON:
      // case TokenType.VAR:
      default:
        throw this.#error(expression.token, "Malformed boolean expression");
    }
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
      case LiteralBoolean: {
        if ((expression as LiteralBoolean).value) {
          return;
        }
        this.#current.label.next = onFalse;
        return;
      }
      case Not: {
        const next = this.#current.label.next;
        this.#current.label.next = onFalse;
        this.#boolean(
          (expression as Not).expression,
          next || new Label(),
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
      // local.register could already hav a value and target could be temporary, so...
      // ownership shows up already!
      local.register ??= this.#allocate();
      const r1 = this.#expression(assignment.right);
      this.#emit([
        Op.Move,
        local.register,
        r1.index,
      ]);
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
      case LiteralBoolean: {
        const index = this.#allocate();
        this.#emit([
          Op.Constant,
          index,
          (expression as LiteralBoolean).value,
        ]);
        return { index };
      }
      case LiteralString: {
        const index = this.#allocate();
        this.#emit([
          Op.Constant,
          index,
          (expression as LiteralString).value,
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
          this.classes[klaz].methods.new, // does it already exist???
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
    const klaz = this.classes[declaration.name.name] ||= new Class({});
    for (const methodDeclaration of declaration.methods) {
      klaz.methods[methodDeclaration.name?.name || "new"] = Compiler.#method(
        methodDeclaration,
        this.classes,
      );
    }
  }

  static #method(
    declaration: MethodDeclaration,
    classes: Record<string, Class>,
  ): Method {
    const compiler = new Compiler(classes);
    compiler.#current.written.add(compiler.#declare(
      new Variable(declaration.token, "this"),
      compiler.#allocate(),
    ));
    for (const variable of declaration.args) {
      compiler.#current.written.add(
        compiler.#declare(variable, compiler.#allocate()),
      );
    }
    const start = compiler.#current.label;
    compiler.#block(declaration.body);
    return new Method(declaration.args.length, compiler.#size, start);
  }

  #statements(statements: Statement[]) {
    for (const statement of statements) {
      if (statement instanceof ClassDeclaration) {
        this.#class(statement);
        continue;
      }
      this.#statement(statement);
    }
  }

  #block(block: Block) {
    const depth = this.#locals.length;
    this.#statements(block.statements);
    while (this.#locals.length > depth) {
      const register = this.#locals.pop()?.register;
      if (register !== undefined) this.#freeRegisters.push(register);
    }
  }

  // not good enough?
  #statement(statement: Statement) {
    switch (statement.constructor) {
      case Break: {
        if (this.#names.length === 0) {
          throw this.#error(statement.token, "Cannot break here");
        }
        const name = (statement as Break).label;
        let target;
        if (name === undefined) {
          target = this.#names[this.#names.length - 1].break;
        } else {
          for (let i = this.#names.length - 1; i >= 0; i--) {
            if (this.#names[i].name === name) {
              target = this.#names[i].break;
            }
          }
          if (!target) {
            throw this.#error(statement.token, `Label ${name} not found`);
          }
        }
        this.#current.label.next = target;
        return;
      }
      case Block:
        this.#block(statement as Block);
        return;
      case Continue: {
        if (this.#names.length === 0) {
          throw this.#error(statement.token, "Cannot break here");
        }
        const name = (statement as Continue).label;
        let target;
        if (name === undefined) {
          target = this.#names[this.#names.length - 1].continue;
        } else {
          for (let i = this.#names.length - 1; i >= 0; i--) {
            if (this.#names[i].name === name) {
              target = this.#names[i].continue;
            }
          }
          if (!target) {
            throw this.#error(statement.token, `Label ${name} not found`);
          }
        }
        this.#current.label.next = target;
        return;
      }
      case IfStatement: {
        const { condition, onFalse, onTrue } = statement as IfStatement;
        if (onFalse) {
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
          this.#block(onFalse);
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
        const continuation = new Label(this.#next());
        this.#current.label.next = continuation;
        this.#boolean(condition, continuation);
        // reset assignments
        const wc = new Set(
          this.#current.written,
        );
        this.#statement(onTrue);
        this.#current = { label: continuation, written: wc };
        return;
      }
      case Return: {
        const e = (statement as Return).expression;
        delete this.#current.label.next;
        if (e === undefined) return;
        const reg = this.#expression(e);
        this.#emit([Op.Return, reg.index]);
        this.#repay(reg);
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
        this.#repay(this.#expression(statement));
        return;
    }
  }

  compile(script: Statement[]): Method {
    const start = this.#current.label;
    this.#statements(script);
    Compiler.mergeLabels(start);
    return new Method(0, this.#size, start);
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
          case Op.Jump:
          case Op.JumpIfDifferent:
          case Op.JumpIfLess:
          case Op.JumpIfEqual:
          case Op.JumpIfNotMore:
          case Op.JumpIfFalse:
          case Op.JumpIfTrue:
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
