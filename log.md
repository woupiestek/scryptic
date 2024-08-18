# Scryptic

## 2024-05-04

### live variable analysis

This is in aid of zllocating registers: variables that need to be live at the
same time, cannot share a register. I don't have variables, but values. How are
these connected? Well, one can at least think of each value as a variable and a
line in the program--the lines are just out of order. Logically, the child
values of a value have to be live at the same time, so that is the option.
Possible issue: perhaps sometimes two values need to be live at the same time
indirectly...

I am trying to imagine a situation, where a reordering of values could not solve
the issue, but it would be a case where two values are indirectly used multiple
times to compute a third, never simlutaneously, but somehow interleaved:
Something like: `y = f(a,g(b,h(a)))`: `a` and `b` are never read at the same
time, but must still be live at the same time.

### label elimination

The end result is a nested s-expression, and by assigning an index to each of
those, and then using a trie to avoid duplication would that not result in a
smaller expression?

But when loops are involved, there is a potential vor labels to contain
themsleves. If they actually do, then there is not issue with generating the
label object and its id, and filling it with contents afterward. But this is
optional, and the processs could produce a label that is already used...

In something like
`var x = ''; while(a) { if x == '' { return x; } else { C } } return x;` the
while should be eliminated. What about elimination after the fact? The trouble
is that that works recursively, so the is a cascade of eliminations afterward.
Ultimately, variables just keep getting replaced.

## 2024-04-14

### live variable analysis

There is a collection of interdependent 'values' now, without fixed order.

## 2024-04-13

### new parser

Idea: replace strngs with numbers here, have a generic node type, as tokens are
used to discriminate anyway.

Along the way, the `break`, `continue`, and `return` moved to the outside of the
block. Why not have that in the syntax, though?

- `break [label]: {...}`
- `continue [label]: {...}`
- `return {...} [value]`

or maybe:

- `{...} break [label]`
- `{...} continue [label]`
- `{...} return [value]`

The last one make less sense for scoping reasons, if there is a return value.

## 2024-04-07

### live variable analysis

Intermediate has values, so the liveness will create a relation between those.

## 2024-04-06

By treating the jump target like strings and values, they can be eliminated and
depublicated alike. However, I do run into new issues, essentially because I
sometimes need the keys before they get computed. I wonder if I took the right
approach here.

It is visible in the results: nothing is stored under 0.

Perhaps if the target keys were given upfront, those could be values of the
statements: like instead of `__break`, `__continue`, `__next`.

A secondary problem could be the switch to using has codes. it is just that
suddenly so many new types of data need to be stored.

### calculus connection

Have a data type to represent computations, instead of labels. The structure is
no too different. The CPS is more direct, though. No more
`(A => V* => L) => V* => L`, but `(A => C) => C`.

### the problem

In the graph, it seems more interesting to keep track of where values can come
from, then where they go to. In paricular, we want to know if many places jump
to the target, or none, or multiple. Does it make sense to create this
inversion?

The nodes of the graphs now each have a list of alternative sources, `return` is
an endpoint, that doesn't become a source, and `if` looks like a couple of
sources, one for `true` and one for `false`. A node may have multiple sources
otherwise.

The sources are values of sorts: they present a collection of values and a
worlds. Otherwise the controkl folw grpah is simply inverted.

So what is the advantage here?

- Sources could be deduplicated...
- No sources means unreachable code
- No CPS, everything forward.

Weird thing though: everything has one target... no, one or two depending on
type. Hmmm.

### solution

I settled on a simpler refactor, that doesn trie to reduce the graph much (yet).

## 2024-04-03

### back to ssa and dominace frontiers and such

Current structure is `(A -> V{} -> L) -> V{} -> L`. So there are label objects,
but generally numbers that refer to struct are used to point them out.
Effectively, there is no way out of an if or while statement, the continuation
gets inlined, whetehr that is efficient or not.

Posibilities:

- the return type could be `L{}` or `L[]`, a record of mutually recursive
  labels.
- delay inlining where you catch it.

The trouble is telling which labels are called more than once.

### changes

Now just get to the point that blocks are created again. Let's figure out how to
only generate the necessary cases later.

## 2024-03-31

### more datastructures

Is zeroless skew binary an option?

The first quetion though is about this parity heap thing: each node keeps a
greatest number and two optional child nodes for even and odd elements, a
division made for balance.

The current coltuoon moves values around insetad of nodes, because changing the
depth of a node is hard.

```
*   *   *   *
 \ /     \ /
  *       *
    \   /
      *
```

## 2024-03-28

### the big trie

For global value numbering.

With the reverse trie this time?

The difficulty is finding the digit after the first one.

## 2024-03-27

### another trie

Can we do the same with skew binaries? Does it help?

- first skip 0, start countering at 1, and drop the first digit, so 1 is the
  empty list
- 2 is 2, so we cannot drop the first digit for skew binaries. does that settle
  it? Maybe lean in: first digit is 1 or 2, so encode that as 0 or 1. Deal with
  trailing 20... by using a list of trees. Sound complicated, and not
  particularly useful.

Think again:

- Some nodes can have two values (one, two)
- Some nodes can only have one (one)
- Binary nodes have (zero:Binary, one:Binary,...) no value?
- Ternary nodes (zero:Ternary, one:Binary, two:Binary) no value?

1 2 01 11 21 02 001 101 201 011 111 211 021 002 0001

I.e. find values after 1 or 2 find '2' only after 0. There are two types of
nodes after all.

The decomposition of a number into skew digits... is not as simple as looking at
the last digit anymore.

Perhaps the problem is getting to the first 1 or 2.

Skew binaries times 2:

### other binary tree

This could work with offsets:

```
        0
   1          2
 3   4     5     6
7 8 9 10 11 12 13 14
```

But if we don't store the indices in the nodes, we'd need delete, get and set to
carry an extra parameter to keep track of the required offsets. The interleaving
traversal function does an amazing job on the old tree.

### other ideas

Starting from the other end

1 10 11 100 101 110 111

0 1 10 11 100 101 110

How to tell where a number belongs?

Time to aprecitate the datastrures I've build.

### back to optimizations

- constant propagation
- dead code elimination
- global value numbering
- register allocation

## 2024-03-26

### skew binaries

I finally understood how skew binaries and trees are related. The idea is to
alwasy skip trailing zeros. For the 2's that just means jumping straight to the
elements. For 0's and 1's, that means special leaf nodes. Doing thing this way,
makes the offset computation easier.

## 2024-03-25

### the right structure

The `NumberTrie` is based on seeing a binary tree as a trie for binary numbers.
I think I am using skew binaries, but I don't see the link clearly yet. To keep
the nodes in canonical order, we start with the most siginicant digit, and work
our way down to the less siginificant ones.

The skew binary link suggests an optimisation where every node has two slots for
values, one at the index and one at twice the index. There are multiple
representation sof each number, but this is the canonical one, and in requires
that the nodes hold up to two values. Missing nodes and values happen anyway,
now they are more often at the leaves.

It might be worth having specialized classes for level 1 nodes, As just holding
3 values, all optional, but not empty at the same time. Only form 3 on the left
and right things become proper nodes.

### trying it

Zero nodes are clearly a special case.

## 2024-03-22

### Use numbers as keys more often

Is the splay map still the best choice?

### special trees

I imagine an insert case that looks at more options:

- `index === this.index` update here
- `index < this.index` go left
- `index > this.index && index <= 2*this.index` go right
- `index > 2*this.index` become root

So balance comes from an extra constraint that uses the absolute positions of
numbers on the number line. something is off about this.

Each number has a preferred depth, and this should determine rebalancing
decisions

### intermediate showing stuff

I needed to tweak the structure to deal with loops, understanding is growing.

- constant propagation
- dead code elimination
- global value numbering
- register allocation

## 2024-03-21

### status

After working in model on a system where changes are propagated forward, I added
a CPS style transform in intermediate.

### ideas

- Use numbers as keys more often
- ~~Formally use CPS~~

In the latest version, I am starting to see that phonies are needed for the
start of a loop, but the rest? If the rest optional, or does that imply some
inlining?

Of course, I use a block argument variant now.

## 2024-03-18

### optimisations

Reminder of the goals here:

- constant propagation
- dead code elimination
- global value numbering
- register allocation

### Tries for global value numbering

Instead of using hashcodes, use number assigned to data memebers to tell if a
value occurs more than ones.

## 2024-03-17

### refactoring splay map

I add 'rotate' for the select case, because I didn't like how the work on
rotating the tree was dicarded. Then I found a way to partition with recursion,
to which I modified rotate as well.

Partition removes the element at the pivot, to support inserts and deletes. This
in not desirable for select.

I think I can solve this with tombstones: empty entries where keys are not
found, which are removed when one of their children gets empty. Rotation
otherwise requires the tombstones ot rortate into the tree with the rest.

### tombstone trouble

I could not quite get what I want if tombstones are required to have non empty
children. Should only the twice empy case be avoided then?

A, but then the null object started acting up, so I needed to kill that one too.

### analysis

SSA doesn't really do what I expect. I just want to solve the program by
inlining variables. This does not even require special handling of if
statements, we can just keep if expressions around.

## 2024-03-16

### todo

- add printer
- add tests and debug!
- track variables
- try missing optimisations

### immutability

Expressions have a value, but contain assignments and declarations, that could
have side effects. The model currently handles this with actual side effects. I
don't like it.

`Values = { values?:RBT<Value> value?: Value, world?: Value }` Main complain
about RBT is that there is no way to prioritize popular keys.
`Alternatives = { break: RBT<Values>, continue:RBT<Values>, return?: Values, next?: Values }`
So maybe implement the splay tree instead?

### splay and refactor

I seem to have cracked it.

### block arguments

This seems closer to the executable control flow graph idea from before than
what I have now. What is the difference?

Variable elimination, but dealing with non linear stuff yet another way.

Each basic block is an object. What does it contain?

See the examples are text again, not data structures. I don't see how this helps
with the desired optimisation.

Every basic block still ends in some jump, but the collection of expression
leading up it can be transform into this map fo values.

At the start of each block, however, a list of arguments need to be provided, Or
the expressions cannot be build up as usual.

The phis make it possible to colect different possible values into one. The
block argument is that vraibles are not eliminated, so their values can be
assigned at the start. So where there was a phi, there now is a variable.

### optimisations

Reminder of the goals here:

- constant propagation
- dead code elemination
- global value numbering
- register allocation

## 2024-03-15

### todo

- ~~avoid duplication in if-then-else with else continuations.~~
- add printer
- add tests and debug!
- track variables
- try missing optimisations

I should probably come up with a data structure that can more efficiently
represent this collection of alternatives that is created every time, and
perhaps make it immutable, instead of of the mutable mess I have now.

Combine the kind of the continuation, the label and the variable name into a
key, and use that in the tree structure.

The keys could be like this `[continuation,label,name]`...

The operations works mostly on the values, so it might be better to work with
nested maps. `RBT<Value> => RBT<RBT<Value>>` A typical continuation should
remove the subtrees though, as my red black tree cannot do that yet.

## 2024-03-13

### object literal form

Like this: `new Class {...}`, but it would define the class, so you cannot have
new woith the same name twice.

### todo

- avoid duplication in if-then-else with else continuations.
- add printer
- add tests and debug!
- track variables
- try missing optimisations

### simplification

- Erase the difference bewteen worlds and values.
- Make snapshot storage a side effect, so values statements can be nested.
- Combine `value` and `#boolean` functions.

The first one perhaps was not necessary.

Work gets repeated when interpreting conditionals...

There should be a simpler solution, though, Collecting and merging 'then'
snapshots and 'else' snapshots, before running the blocks.

Perhaps the analysis is just not that interesting: a boolean expression may
require jump to interpret, but those jumps don't matter?

There is an issue of assignments and the like occuring inside, As well as the
possibility of using block as expresssion later... So creating and marking
snapshots as being on either side . Maybe I am mistakesn about needless extra
work: the alternative world all need to be build.

No, this is a important matter: with a complex condition, do you first jump to
the starting point of collective if and then branches, or do you copy those
branches as many times as needed? That is the issue.

The solution is to represent the jump to the else branch as a new continuation.
better pick a lable to tell elses apart, like the else tokens.

### for the printer

It feel like we should put all teh value into an array, and let them refer to
eachother by id, but: brainwave, why not build that array from the start?

## 2024-03-11

### todo

- ~~generate alternatives~~
- ~~process alternatives, i.e. merge them back into the model where needed~~
- add printer
- add tests
- try missing optimisations

### the trouble now

A block may end in nothing, which simply continues processing alloing the main
line. The trouble with that is, it is not inlcuded in the alternatives.

So what do we make the rule now?

- Each model says where it wants to jump to.
- Alternatives do not need to contain `this`, it should be the other way around.

### the two problems

Firstly a matter of modelling: the effect of a stament is a function
`Model => Model[]`, the list reflects teh nondetrminisim of multiple paths. But
since we made the models mutable, we con remove the point to `this` from the
return value.

Secondly the while loops, how to get the endresult into the beginning? With
phonies, of course.

So jump targets get these extra nodes of phonies, in the case of the while loop,
one up front, where afterward the new values are put.

Perhaps this analysis of the dominator tree does a better job. I don't
necessarily see how.

So I guess I got it, and with some pruning, I may already have a reasonable
optimizer.

### SSA form explained

It is a process of variable elimnation, which result in a complicated graph in
memory. What doesn't normally happen with variable elimination is branching,
which are handled with the phonies at the jump targets.

The whole compotation of the dominator tree: it seems like structured
programming languages make this trivial, leaving such points aat the end of if
statements and as the beginning and end of while statements, and not really
anywhere else, exception perhaps in boolean expressions. Or perhaps computing
the control flow graphs and then the dominator tree is actuuly more much more
efficient.

Interestingly, the extra world variable introdcued to keep side effects under
control, automtically creates an inverted control flow graph for the program,
with the phi functions as 'come form clusters' within. Simple updates to the
world and values can be collected into a new kind of basis block, of course. The
pretty printer should probably invert this again.

## 2024-03-10

### play with new analyzers

Keep expressions in order to keep their side effects so, however: ssa suggests
just introducting new variables...

So instead of keeping a list of expressions, work with tabels of variables and
their ultimate values. But how to keep the potential side effects? Solution:
world parameter! For impure constructs: keep track of the order of certain
subexpressions, by pretending that they manipulate a world variable.

One way to think about it, is to transform code in order to eliminate variables.
This is a departure...

So the SSA transfrom transforms a source code, while I transform a tree of
objects. The source code needs variables with names, which SSA updates. I use
the implicit references to the nodes instead, so there are no visible names.

The phony functions take care of branches: the different expressions for each
branch are combined. Is that enough though? They say: runtime support picks the
right version, so does it needs to be more like `(if x y z)` if we want the
control flow graph inside the expressions.

Anyway: inlining ast nodes is most of the optimisation.

### strategies

Each node creates a record of assigned variables, or rather is an endomorphism
of the expression record. Some way to quickly and accurately find duplicates
here would be good.

Dealing with expressions:

- `var x` have some special value for the declared but not defined state.
- `x` replace with value if possible. Could use parameter index here
- booleans: expressions get changes into control flow.
- `new` this could be a place to use the world variable, to keep track of side
  effects.
- `log` world variable certainly belongs here
- literal: inline aggresively
- `[...]([...])` another application of the world variable.
- assignments:
- access: perhaps many cases, as anything can be accessed.

This one needs words: `new A(...)` is a call expression, mainly to avoid the
`new A` function pointer, which is not allowed as first class value right now. A
similar case, `x.m` is interpreted as something else in these cases, but perhaps
it should not work like that.

Maybe only use the world variable for tracking branches, and let phonies depend
on the world? I don't see it.

### issues

A block can end with break or continue (or return!) instead of causing a normal
change. I need a way to keep track of that as well. The solution is to steer
closer to the phi value, and treat picking a branch as an update to the world.
The consequence is that the world starts looking like an inverted control flow
graph.

### todo

- generate alternatives
- process alternatives, i.e. merge them back into the model where needed
- add printer
- add tests

## 2024-03-06

### graph coloring

The connection between regsietr allocations and graphs coloring is obvious:
create a graph where the vertices are the needed registers, and the edges
connect registers that are needed at the same time. Then look to color them with
the registers that are available.

## 2024-03-06

### todos

- more expressions, as in: make everything that can occur inside a method an
  expression. `;` as a binary operator.
- type checker
- numbers, arrays
- optimisations

### garbage

Since the garbage collection needs to know what it is cleaning up, objects need
to contain their class. Not all details of the class have to be recorded. It is
mostly the amount of data, and what parts of it can be pointers, and the
interpreters could to normalize, so many classes can share the same layout of
fields. The downside? Unions of classes are a bit harder to tell apart.

### object literals

Been through this before. If a functions is valued in a union of classes, then
the range of that function is not any particular class. So how can classes be
defined? it could be part of the object literals: `object x:y {}`.

This is a breakup between classes, which are tied to a specific layout of data
in memory, but also to an implementation of the methods on and hand, and images
of functions, which provide things like encapsulation and control over the
states of objects like classes do, but are not constrained the same way, on the
other.

### limits and colimits

For types, the colimit side has the eager products, sum and existential types.
This is data. The limit side has the lazy products, functions and generic types.
These are the traits. A class is something in between.

### operators

Import and export in the middle of expressions with operators. Same for
declaring types: see these are special side effects.

## 2024-03-04

### breaking up compilation

To apply SSA related stuff, perhaps there should be one step to create an
intermediate representation, in the shape of this control flow graph, and a
second step to turn that into a list of instructions.

### more on ssa

SSA is extended to arrays in early papers, and the notation works for objects.
It basically makes assignments to fields look like immutatble varaints of the
same operation.

## 2024-03-03

### todos

- more expressions, as in: make everything that can occur inside a method an
  expression. `;` as a binary operator.
- type checker
- ~~class, methods, calls,~~
- numbers, arrays
- optimisations
- ~~constructors, returns~~

### dynamic variation

I am thinking: stick with classes inside objects for now. Reconsider after a
type checker allows avoiding dynamic dispatch.

### blocking and repl

Use blocking to implement a repl for this language.

### labels as linked lists

Each label one instruction, basically. Putting instructions in order and even
computing jump offsets won't have to be difficult. Merging certain aspects
together, delaying the layout of the methods.

It could help with parsing to use linked lists of statements as well, despite
all appearances.

In the ultimate implementation, have arrays acting as linked lists? I.e. an
array of linked list nodes, with the nodes merely using array indices to point
to other elements, to make the linked list space efficient.

The same array can back multiple linked lists. This is becoming baout a data
structure with gargabe collection integrated. So there is a single array with
nodes, and a structure that points to an index, to represent a list. Perhaps
this structure also keeps a reference count, to indicated to the global memory
that some index is no longer needed. Maybe not.

Anyways, each entry would have an extra field to point to the next entry, which
ironically would be one index below if the list is built by attaching elements
to the front as usual.

### handling variables

Clox and rlox use this linked list of compilers. But let's think about this.

A method in the current language may refer to other classes, and to variables
that got passed in, but what else? Much can be excluded that his point.

So the list of local variables is pretty simple: this, and whatever is declared.
From the surrounding script, only the classes count, and they are not in
registers, if they don't need to be.

The surrounding script is a special case, mostly here for testing.

The class variables are a challenge, right: suppose we want to point ahead in
the direction of a class that is not declared yet. How can the compiler resolve
that? It seems like the class object need to be created as soon as the class is
found.

### classes

Classes are global variables, distinct from locals. The funny thing is that
classes can now be defined piecemeal, by using multiple declarations. Methods
can also be overridden that way. Adding methods after the fact is what I like.

Now the constructor...

### optimisations helped by SSA

- Constant Propagation: Translation of calculations from runtime to compile
  time. E.g. – the instruction v = 2\*7+13 is treated like v = 27
- Value Range Propagation: Finding the possible range of values a calculation
  could result in.
- Dead Code Elimination: Removing the code which is not accessible and will have
  no effect on results whatsoever.
- Strength Reduction: Replacing computationally expensive calculations by
  inexpensive ones.
- Register Allocation – Optimising the use of registers for calculations.

## 2024-03-01

### compiling 'everything is an expression'

Creating the parser that generate such output is not a problem, although it does
bring some challenges. For example, should `;` simply be an operator? and the
delimiters `{` and `}` simply a way to group expressions, like `(` and `)`? Why
have extra delimiters then?

Compiling it might be an issue. Every statement must have a value, so can
statement be empty? What does `x = {}` do?

I thing lables should be special tokens, I think it is inconvenient to let them
be identifiers.

I like the idea of `;` and `{...}` being operators, but then `;` may get
required where you would not expect.

Could be an interesting problem, or not really that important. I guess I better
pick something else to work on now.

### classes and methods

Once again, lot's of ideas, like adding methods after the fact. I need to see
the vm handle this, though.

First, where do classes and methods actually live? How do they get there?

Wait... the compiler has to resolve classes by name, but the same does not go
for the vm. The 'load constant' op should be good enough.

## 2024-02-29

### todos

- more expressions, as in: make everything that can occur inside a method an
  expression. `;` as a binary operator.
- type checker
- class, methods, calls
- ~~loops~~
- numbers?
- optimisations

### more expressions

Moving toward a Pratt parser for most stuff. Pratt does handle postfix
operators, as an infix with an empty right hand side.

## 2024-02-28

### example output

```json
[
  ["Constant 0 wrong!", "Jump 1"],
  ["Jump 2"],
  [
    "Move 1 0",
    "Constant 2 right!",
    "JumpIfEqual 1 2 3",
    "Constant 2 right!",
    "Move 0 2",
    "Jump 1"
  ],
  ["Jump 4"],
  ["Move 1 0", "Log 1", "Return"]
]
```

So the idea of an abstract assembler has morphed into executable flow charts of
sorts. Good to keep in mind. So thing that the compiler should be better?

- don't generate as many jumps.
- don't generate as many moves.
- don't loads the same constant twice, especially to the same register

Extra labels are generated on purpose, to simplify the code for boolean
expressions, so I added a method to remove those after the fact. At this stage,
further inlining may be possible, but that is probabaly more inbtereste once
actual bytecode get generated.

Register is aless easy. Some extra registers are allocated for the evaluation of
each expression, including constrants that are loaded already, and variables,
because there is a deallocate instruction to make register available again.

Use the opposite rule? A register holds a variable, constant or is a temporary
for the evaluation of expressions. when allocating a register, first a check if
it is amongst these sets. Note: there is a trade off between loading a constant
more often and using more space to run the methods.

### a few optimisation fruther

```json
[
  ["Constant 0 wrong!", "Jump 1"],
  [
    "Constant 1 right!",
    "JumpIfEqual 0 1 2",
    "Constant 1 right!",
    "Move 0 1",
    "Jump 1"
  ],
  ["Log 0", "Return"]
]
```

There is little left now, just the annoying constant thing, but it may be better
to optimise that before generating these assemblies. That is, an optimizer
working on the AST might create a local variable for the constant, becauae of
similar subexpressiosns etc.

### classes methods and calls

So there are two directions: a more dynamic variant, which is more abotu this
particular VM and implemntations, and the ideas about the ultimate language,
that would run on a more serious machine.

For now, we follow the Loxian principle that field are free game.

So the first dilemma comes up quite fast:

```
class Car(brand, model,...) {
  var price = ...

  def drive(where) {

  }
}
```

This has to deal with variable capture, which is something I wanted to avoid. So
a style with a special constructor method is a better choice for now.

This is the crux, right:

```js
function ctor(u, v, w) {
  var x;
  var y;
  var z;

  function a() {}
  function b() {}
  function c() {}

  return { a, b, c };
}
```

Behind the screens, with lambda lifting etc. a class and a single constructor
are generated for all the variables that are captured by the nested functions,
so the result can be a proper object, a record with functions, operating on a
set of data in the background.

The one idea missing here is that specifically function that do this can have
image or range types. All classes implicit? Then a class cannot be declared
without constructing it. That does not seem right.

This is a weakness of the lambda lifting solution.

Let's stick with declaring classes roughly as the data model says they look like
in memory: records of methods.

```
class A {
  new(...) {

  }
  methodA(...) {
    this.methodB
  }
  methodB(...) {

  }
}
```

Other constructs: `new A(...)`, `x.m(...)`. And don't forget about the `this`.

### content dependent token

Essentially have two token types, where one suggests a special case of the
former. E.g. all comparison operaor have main type 'COMPARISON', and subtypes
for each option.

Actually, the compiler can work with token sets to the same effect. Depening on
the context a keyword can be an identifier, that just means there is a token
type set of variable names. This also always true for context dependent
exceptions, like members of objects cannot be called `new` or `class`, because
those is have special meaning, but having a method called `log` is fine.

### one more thing

Allow for a mix of declarations and expressions in these `scripts`, but not
inside methods, or in modules.

### todos

- more expressions, as in: make everything that can occur inside a method an
  expression. `;` as a binary operator.
- type checker
- class, methods, calls
- ~~loops~~
- numbers?
- optimisations

## 2024-02-25

### the read before write problem

How to compile `if` statements or expressions? The required jumps are:

- the conditional jump to the else instructions
- the unconditional jump past the end Technicall no jump is needed from the
  else, but its end is a jump target, so with the current data model, that
  becomes a jump as well.

So when compiling any part, it may be closed with a jump or return from its end.
This jump target is a parameter to be passed. The nice thing about passing along
the jump target, is that it can be overridden with `return`, `break` or
`continue`.

Now the next problem: read before write. The linear code uses register
allocation to keep track of which variables are assigned. It is possible to
assign variables on some branches, while leaving them unassigned on others
however. Extreme (and potentially useless) example: `x = if ... then ...;` The
lack of the `else` branch means that variable `x` cannot be read now... Perhaps
this case should be outlawed somehow, this assignment is rather pointless, after
all. This still requires detection, however.

Against outlawing: `var x = if ... then ... else break;`; so: leave the
loop/switch if `x` is not assigned. This is fine, isn't it?

Each jump target has a set of variables that are going to be read. Any mismatch
between demanded and supplied variables is a problem. How to detect this? Even a
check at the end of an if statement to see that both branches assign the same
variables is no good, as the conditional variable declarations shows.

Of course, a type check, that we want anyway, could solve this issue. So while
compiling and admitting instructions, The compiler tracks variable use accross
jump targets:

- for each jump statement, list the variables that are assigned at that point.
  Record the token responsible for the jump.
- for each target, collect the variables that get read.

At the end, do the 'type check', in this case for two mismatches:

1. read before write.
2. write, never read -- but maybe this requires more thinking.

The jump target may assign its own variables, or read variables from a shared
context. The shared context is fine, we have a record of variables in scope, and
which are assigned at each point. The self assignments should be omitted from
the demanded variables, however.

The part with the jump statement may read variables it writes. If we want to
keep track of which variables are read, we need to account for this. But now we
are leaning into SSA and stuff like that.

Best startegy for now is to track those jump versus jump target stack frames,
and raise an error after compilation of a method or script. This requires tokens
to point to the right constructs.

### offsets version positions

Clox used offsets of current position for the jump, probabaly because most jumps
are small, within the 65536 instructions and often within lower bounds. An
offset from the start of the method might be too large, or perhaps takes up more
space, as teh start of the method must be cached.

### labels

Only certain statements/expression are accepted as jump targets, so others need
no labels.

### unions of classes

Why not do this: compile `x.m(...)` as `switch(classof x){ case A: ... }`... A
method may have a different place in each class. This is know at compile time,
but branching on the class pointer could be cheaper than maintaining extra
classes.

### strategy against read before write

Record at each jump which variables are written, but take intersections. The
when the target is compiled, start with the intersection and read from there. A
to register assignment, that can still function the same way.

### compiling expression, boolean and general

The trick with boolean expressions, is that the short cirquit, so instead of a
value assigned to a register, they get a jump target, if their value is falsey.
A general expression can be boolean, but has an optional target register. If
there is no target, the boolean can still be evaluated for side effects, but no
jump will be needed. If there is a target, then we can assign true an false to
is in different branches... i.e. `x = e` effectively becomes
`if e then x = true else x = false`.

### refining

No jump from halfway in a subroutine, only allow them at the end. It could help
with dead code elimination as well. It could drastically simplify the
compilation of anything invloving booleans. I don't like how much code I needed
to copy here. And I haven gotten round to tracking variables yet...

It is weird to have that experience again, of getting everything right without
testing.

### if statement syntax

We could just require blocks for the branches behind the statement, avoid
sabiguous scoping that way. The block in turn could just use the `(,)`
delimiters, if they are indeed expressions.

### keeping track of assignments

It is a relation between subroutines and local variables, but this new option,
where each subroutine keeps a collection, has as only downside that it keeps
locals alive that are out of scope. Tracking on the locals is more complicated
because of all the copying needed.

## 2024-02-24

### control structures

Boolean expressions:

- ==, !=, <, <=, >, >=
- &&, ||, !
- `if` ... `then` ... `else` ...
- `loop`, `break`, `continue`, `while`, (`for` requires numbers)
- labels
- parentheses
- if expressions?

Working in assignment and such, but struggling. It is nicer to have a simple
rule for operator precedence Similarly, if the lexer did not label keywords with
their own types, that would make the lexer simpler, and allow the use of
kaywords as identifiers in unambiguous contexts. That would also shift work to
the parser, though. Now that I think about it, could it be better for the lexer
to just generate one token type for each precedence level?

The peacemeal character of the lexer is nice. Could the parser do the same?

Then look at Rust again: nearly everything is an expression.

### statements vs expressions

- Various declarations, for classes, methods, variables etc.
- the `log` expression. Perhaps variants that can block the machine and given
  input, seeing as how they are intended as debugging tools right now.

One advantage the unions of classes idea brings is that an expression may have a
union of concrete types. Can we elaborate?

Fat pointers all the way: Have classes for everything, even void or null, values
types an so on. Allow matching a class with a trait at runtime, binary search in
a set of implementations of each trait, or just going through a list... the
classes could be sorted, and binary searched to a resolution of say 16, after
which a linear search is done, assuming banery becomes slower at a point.

Functions in scope could be extention methods on void... that is, depending on
how method declarations are going to work, this might be allowed:

`def method(this: void, ...) {} void.method(...)`;

Then add syntactic sugar:

`def method(...) {} method(...)`;

This union of classes must be allocated in sufficent space for the biggest
members, the fact that some of the registers are not used because the expression
has nothing to give back does not matter.

The empty type is for expression that never returns, i.e. loops and runtime
falures. The void type indicates that zero space is needed for the return value.
Eventually the runtime can just put the void class in the target register, for
the current dynamic version, there is `null` as placeholder.

Which brings up a new control structure: the class switch. An expression whose
value is an intersection of classes

Interesting: if a trait can have `static` methods, then the void class doesn't
get polluted...

### dynamic dispatch

The method table could similarly be an array of pairs. Each pair has a method
key and method pointer. The array is sorted by method id, to make fast search
possible. Sure, having a fixed index is even faster, but this gives some
flexability. Would it be worse than having lots of small trait implementations
lying around?

Of course, and extra challege here is overloading and subclassing... no,
actually, because the dispatch is static or the arguments the compiler should be
able to tell which method key to use, should it not? It creates the dependency
between specific versions of libraries. This is a choice, to have a cross module
agreement on method identifiers, as part of the module interface. A choice that
won't work for dynamic distributed systems...

One thought is that the interpreter might fixs things somehow: callers use
method signatures without checking what the imports provide, it just says: this
method form this class form this package. The interpreter finds the best match
once, then loads that into the method table. Now there is a trade off between
lazy loading, which implies a lookup cost for every method call, and eager
laoding, which implies longer start up times, as the interpreter load all
classes and fills all tables ahead of time.

### Grammar redesign

Allow this: `x = if y then z;` but then have a way to check, like
`if x undefined then ...;` Also, what does `x = true;` do?

### control structure in expressions

What to do about the case above? Were are in a situation where `x` either is
assigned or not, depending on which branch is taken. It will be hard to tell
whether variables are in fact set.

Currently, there is an issue that a variable may get assigned on some branches
and not on others, but the first allocation is used for register allocation. So
how to tell that it is too soon to read a variable?

## 2024-02-22

### handling objects with memebers

The next struggle is setiing and getting object members

- The are more notions of target now, As we may want to move a value from the
  stack to the heap at the end of the day.
- The other way around runs into issues with things not being of the right type,
  seeming to ask for some type checking.
- Register allocation also becomes a question: the system just moves over to the
  next one available, maybe we should allow for some clean up.

- I see more targets... we can at least try to add print as target, to further
  limit the number of register allocations.

Something is difficult here -> Assiging to a field ask a register to take dat
from. The other instructions mostly ask where to put things. Hence, there is
some temporary register needed there...

Simple algorithm for register allocation and deallocation may be good enough, as
long as we remember to deallocate all in the right place.

For now, all values take up one slot. That may change.

I can do things with objects now!

### references vs incides

Static memebory might function with a layer of indirection, where a function or
class has an index in a global array of constants so their references on the
stack can be less fat. IDK, it is an idea.

### left todo

- invoke and jump.

Jump is mainly compiler complexity, though it also involves adding syntax for
it. The only things to compare right now are strings and objects...

## 2024-02-20

### var declarations and objects

Lox from Crafting has var declarations, as a way of introducing variables.

Idea: don't allow assignments, and a lot of trouble is over. Every `x =` is a
declaration of a new constant, and leave it at that. Or maybe that operation
should simply not be allowed: pick a new name please!

However, I wanted a language with optional mutability, so there must be a way to
declare actual variables. Is it bad to have this combination:

- `var x` introduces a new variable. `x = ...` is takes as assigning as long as
  this is in scope.
- `x = ...` introduces a constant.

This is probably still confusing: you want to introduce a constant, but
accidentally assign to a variable from context, especially after copying copy
into a new context.

A separate assignement operator `:=` could help.

### the type system

The main types are the traits, which are just records of functions. The classes
are ranges within those traits, and unions of classes are therefore possible.
This leads to a question though...

One can define a union of classes that implement different traits. Extension
methods could be defined or derived on such unions, especially if methods with
matching names and signatures exist. Is that how it works?

The unions of classes alos seem to require a fat pointer. This is not enough
however: The classes must be forced into the shared trait somehow. To be
precise: if classes are indeed arrays of pointers to methods, then the methods
must appear in the same order for each implementation. Also, any extra methods
must be left out of the united version of the classes.

These unions of classes are the replacements for inheritance.

Maybe that should be explicit: only classes of the same trait can be united.
There is a down casting operation that enables this, which actually crates a new
class to fit the new trait. The desired ordering of the methods, finally, is
fixed by the runtime.

## 2024-02-19

### grow the language

Consider compiling to wasm?

### packaging

I guess each module needs to own its traits and other types, as in provide a
runtime layout for the functions, so there can be no confusion about it. There
is still trouble with linking and inlining, then, if another version of a
dependency is used at runtime: one module may specify that a method occurs in
one place, the next in another. In other words, the layout can only really be
decided at runtime, by the run time. It is up to the run time to generate the
necessary implementations.

This about the process: the runtime knows where it put all the functions. It can
generate implementations by putting function pointers in an array. Would it
really work that way?

It seems like a way to get missing method errors early: when loading a module,
mismatches between traits defined in one place and implemnentations defined
elsewhere would show up quickly.

Alternative: dynamic dispatch could be lazy, in which case the missing method
error happens when the method is first called.

### trait

A trait is a type, namely the type of arrays of functions pointers, in
principle. In detail, a trait might simply specify a way to resolve such
pointers based on a layout of methods names and a global hash table of methods.

### more stuff

- new objects, and objects with members
- var declarations: are they needed? seems like a good safe guard
- block structure: variables going out of scope

New example:

```
x = "Hello, Tom!";
{ x = "Hello, Harry!"; }
print x;
```

Obviously, the result should be "Hello, Harry!" I don't think it is now...

### use for blocking the machine

think about the interaction between the machine and the command line blocking it
to wait for command line input, and later adding the option to read data from
the prompt that way...

## 2024-02-18

### to add for a fuller language

- constructor
- control flow: boolean logic
- arithmetic
- types
- any side effects

### fields

So the idea is that everything goes back to simple structs, and field accesses
and the like, but how do you actually access those fields if they are not
public?

On the flip side, how will encapsulation actually work? I am defaulting to more
of the examples, of just declaring a list of fields with modifiers like `public`
to create an interface.

Oblidatorily private fields might be good as well. Though this raises new
questions about dynamic dispatch.

Note: the inlining of objects and the stack and in each other runs into the same
issue: there is no option for assigning those fields and locals! The only thing
that could work is copying field by field. It is also imposible to properly
garbage collect an objects when memory overlaps like this.

### the alternative

Object literals. Maybe that is not the right word. Basically, a constructor
merely is a method that returns literal objects. However, it would not have a
return type (other than object). This may ba a solution: the class would have to
be added to the return value here.

Mixed solution? Let methods return and classes export.

### too many issues?

What was my aim here? My answer to a better Java is adding unions types, and
perhaps runtime support for higher kinded types. The fat pointers gimmic has me
distracted.

But not just have classes with fields and constructors, etc.?

Well, the traits thing seem to require that classes can be modified at the point
of class loading, adding new methods to existing classes. So, a class is not
merely a simple array of methods, it needs to adjust to the methods available at
runtime for each class.

All is just unions of classes, which members are implicitly tagged with their
classes. But how does dispatch work? For simple unions, it could still be
static: compare classes and select the appropriate method object depending on
the match. For traits, the layout would have to be the same in the class object
passed along.

I am not getting around to building stuff, since I am still pondering end user
requirements.

Ideas:

- every method an extension method
- unions of classes
- classes as images of methods
- traits

I think the first one clashes the most. An object of is a record of closures.
The layout of the record is its trait. For efficieny and consistency under
mutation, all of the fields of the object share the same space on the heap.

Extension methods leave this behind: they are not actually members of the
classes, they just pretend to be. So if every method is an extension method, and
object can only really carry fields. Dynamic resolution cannot depend on those
fields.

It is fine to implement traits and use those implementations in fat pointers.
The trait has a static layout, so method selection can be fairly quick.

Just breaking up: instead of classes, declare structs. Allow setting, getting
fields on simple structs. At some point though, the fields of the struct should
be hidden.

Module boundaries: the fields of the structs are visible in the module where
they are declared, but not outside it.

### for now

Just work toward a simpler, more dynamic language.

we are exploring:

- fat pointers
- register machines
- proper control flow maybe that should be it for now. If we can do a simple
  type checker, that would be fine.

- class declarations
-

A reminder that types and encapsulation can be erased by the compiler.

### language sketch

Initial version, dynamic, kind of object oriented.

Interpret any script as the main method on a simple object? Just be easy about
it.

No static void main. Just a runnable, or even simpler, a 'script'.

### debugging

Thinking about blocking and resuming the VM. Idea: instead for printing with
console.log, use events to get the messages out, so a test can check them out.
How would this work in the opposite direction? Well, the machine could block.
Just stop running at the instruction, and resume when an answer comes in.

The core loop is it it own private method.

There is a decently typed version, but a simpler answer may be to have run act
like an iterator, executing until some break point is reached. If user input is
wanted, the result value can be used to store it.

None of this is really necessary for print, and it would probabaly kill
performance there. Might be interesting to compare how java, rust and zio deal
with this.

## 2024-02-17

### threaded code

Labels as first class values. This is sortof what I was looking for.

### Dalvik analysis

Ok, Dalvik has call instructions than can contain an array of arguments, always
being registers. When a new frame is allocated, the arguments are copied into
the new frame. So no overlapping stack frames for parameter passing, but in
stack machines, lots of copies are needed anyway.

Dalvik has 4 bit register addresses when it can.

It feels like, if you see a call coming, you can first allocate a new frame,
then write the arguments right into the frame... or maybe not. If functions are
called in sequence, returning a value into the argument of the next function is
not possible.

Special instruction for copying return values into the current frame if desired.
Note that this could be consider a part of an extended instruction thst
specifies both type of register.

### Compile time reference counting

Reference countring is mostly for dynamic garbage colection, with the potential
benefit of detecting garbage and freeing space early, compared to mark and
sweep. Doing this at compile time means making predictions about how a method
call affects each count, potentially allowing the complier to control when
counts happen, and whether objects are dropped.

Note that all copies of a reference on the stack are deleted when the methods
return. So maybe don't count those, and focus on the references copied into the
heap, e.g. by becoming part of either the arguments or the return value of a
function.

In effect, this is a reinvention of ownership: if a method owns an object, then
the objects can be collected before the methods ends.

Was interested in keeping the `mut` from rust anyway: instead fo making
mutability part of the class, it is part of the method that operates on the
class. Ownership would be another keeper, mainly as a way to collect garbage
more efficiently.

### allocation 'on the stack'

Idea was: put all the fields of the object in registers. Downside: potentially
huge frames with many registers, leading to less efficient memory access.

## 2024-02-16

### accumulator

Like default registers to deposit results. Advantage: one less register per
instruction, including return.

The registers of the register machine are not on the stack, the stack is needed
to store reguster contents suring function calls how does this normally work
though?

The register machine doesn't need the offsets! However, the virtual register
machine of dalvik Works this way.

I guess a combination is best:

- the start of the stack frame contains long lived variables
- intermediates can be stored on a local stack, depending on how much is needed

Ideas around functions calls:

1. the caller can put the argument values at the start of the about to be
   allocated frame, the end of its own frame
2. the callee can leave its return value at the start if its frame

So what is the strategy for expressions with function calls?

I think my instincts are right: the stack is the same as before, but since the
sources an targets of operations are specified, a value can be kept as long as
it is needed.

## 2024-02-15

### the instructions

Somehow lower level instructions, like selecting a method could be seperated
from calling it, but what would be the benefit?

But think about it: the frame could look like this: `fp, op, args...` How to get
the function pointer?

- For static, it is a constant loaded from the constant table
- For dynamic, it is a loaded from a class... The dynamic case introduces an
  instruction for selecting method similar to moving a field into a register,
  but with no other use, and no other way to be used.

Think about it though, if interpreting the lambda calculus is a goal, the
closures usually take the form `fp, op`. These are equivalent reduction: a
closure is an object with one method, an object is a record contain a number of
closures. So in the object case, you get a select-and-invoke method instruction,
which may be expensive for the special case of closures, since the selection
step is superfluous. But in the closure case, each closure would need its own
pointer to the heap...

Remember how the system is supposed to work with unions of classes as well,
which also require a form of dynamic dispatch. I assume that these types are
eliminated by the compiler, which either uses a sequence of compare and jump, or
perhaps a switch construct. Jump to computed offset is not a supported option...
yet.

### simple register machine finished

A lot is missing now, especially a compiler, and unit tests of course. There is
little the machine can do as well. And it won't be fast, dues to al the
indirection on how everything is stored. The ideas are there. So now we need to
test it.

### abstract classes and classes in general

Perhaps the effect is reached by some other means. Much is left to the
compiler...

### next steps

- write tests for the machine
- write an assembler parser, perhaps
- write a compiler

## 2024-02-14

### Thinking through dispatch

Assuming a unit of compilation like a class, or a module, a crate?

The compiler cannot compute the functions pointers that the run time will
generate for various functions, during all possible runs of the application.
Even computing offsets is risky, as that limits how the interpreter can organize
its memory. So the only realistic choice is to have a methods table, and have
the byte code use the indices in that table. The interperter simply has to
supply the function pointers in an array that is layed out in parallel.

One of the advantages of static dispatch is inlining, which can safe the cost of
a function call. This is something inevitably lost with dynamic dispatch, as the
function to inline may not even have been written yet.

Other than inlining the disadvantage of dynamic dispatch is not obvious. The
table of methods just becomes an extra argument, the fat pointer we've been
talking about, and the call being made is similar.

I guess other stuff is hidden, like aside from optimisation, caching in the
processor works better if all methods live near each other in memory.

I was thinking that maybe the issue is that the tables have to be generated by
the caller, which is possible, but if the function declare the traits of their
arguments, there cannot be much of an issue. Even anonymous, ad hoc generated
traits don't have the be an issue. As long as the compiler can lay out an array
of method identifier for every trait in the source code, everything should be
alright.

Lazy versions of this are also somewhat obvious: start with empty arrays of
pointers, in each module, each trait etc, and let the run time resolve the
pattern the first time a method is called.

### to test it out

Compiled lambda calculus maybe? Or a lisp?

It is better to stick closer to the machine, I guess.

Or maybe don't bother with teh array of fcuntion pointers, just build a
structure that only rougly behaves like it.

This project revolves around an idea for a lambda calculus varaint

### what was the aim?

I have 'nominal', a project based around the idea of using types to name
variables. 'scryptic' shows a varaition of the lambda calculus, that takes for
grante dthat function arguments are records of elements. These belong together.
The assumption is that several transformations are needed here.

Well, the interesting part, the type checker, never seems to play any role
anywhere.

See that is it: use the type checker and other clever modifcations to transform
strange code into something more mundain.

The 'mundain language' could be higher level than bytecode...

Soemthing like one step away from being compiled...

- Since type checking is done, the language would actually be weakly typed. You
  could crash the interpreter by mixing stuff up.
- it could be like assembly.

Maybe that is the way to go: an assembly language for the constructs I have been
considering, and an interpreted that works with that.

Would it really be so bad to first build something here in typescript? It is not
about being performant, but about designin the runtime.

- So start with an assembly language.
- An interpreter that loops trough it.
- But do obvious like: keep constants in line and such.

Simplified versions of the heap, the stack, etc.

I did such a thing with tslox. Is it crazy to try again?

It could be inver simpler this time: don't even bother with a constants table,
Don't use proper upcodes, but lists of ops with values embedded and so on.

I made this analysis for rlox:

- byte instructions, bytes are offsets into the stack, the upvalues, etc.
- constant, where the constants are strings, functions or numbers
- invoke (constant + byte), same idea, but more arguments.
- jump, the distance for the instruction pointer to cover. Best solvable with
  labels in assembler, of course.

So the interpreter would just be rolling down the series of instructions.

## 2024-02-13

How would dynamic dispatch actually work with the fat pointers? Static memory
has implementations for each trait, and those are being passed around
everywhere. This is a different approach isn't it?

So the unions of classes idea, there is a list of classes a variable can have,
and each method call implicitly depends on which class is selected. The compiler
could probably just optimize that to a switch statement or if-elses. With a
trait, the sense is that the indirection would be greater, as all object with
the right method names and types would qualify. However, this could imply
relatively expensive dispatch based on method id, without the ability to the
compiler to just use an offset into a static method table.

So, some insight in how rust may be doing it:

- every trait implementation is a table in static memory, and an object does not
  qualify as a member of a trait, unless the implementation is given.
- higher kinds are implemented with as _derived_ traits. They call it zero cost
  abstraction, but if they are ued for dynamic dispatch, then the cost doesn't
  look like zero.

### multiple dispatch

The method id is clear at compile time, surrounsing classes not necessarily, so
why not have a table for methods instead? It doesn't really liberate you from
traits, though, as you need to record the interfaces somehow.

## 2024-02-12

Better to seperate fancy language idea form VM ideas.

It is funny with statically typed closures, that the may just pass around a
pointer to the heap, but it acta like a function, because the compiler remembers
the function called.

In general, classes can have virtual methods, which are more like default values
for a typed hole fill with any implementation. I propose this would work with a
fat pointer just for the implementations.

If the class is final, and really the range of a function, all that neead to be
pass around is a pointer to the values on the heap. It could even be other data
in those cases, but that complicates things again.

### Inheritance vs composition

Inheritance can add field to an existing object, making the allocation in memory
longer. In contrast, composition seems to imply a nested structure, where the
object contains pointers to other objects. Under specific conditions it won't
have to be this way. The important part is that allocating space and running the
constructors can be reordered, so all allocations happen in one go. Each member
objects methods are then run at an offset from the pointer to the main object.

Cheap wrappers that way.

The main use of inheritance, I gather is to get a certain interface, then, one
with more functions in it.

### Recursion and generics

Member objects cannot be inlined if their type is generic--only defined by a
trait--or if the type becomes recursive. This is an interesting take on
recursion overall: the member object type is actually only held to have the same
inteface. That way the functions are available for calling, but the data must be
allocated elsewhere.

A, but as everywhere when generics share interfaces/typeclasses, the interfaces
only need to be stored somewhere once, possible just at compile time, if there
is no inheritance--but that conflicts with recursion anyway.

Eventually a recruisve type is alwasy just an initial algebra of a generic type,
which is possible, because the methodes are treated as something separate from
the type.

### traits as a kind of generic.

The view is that a trait is a kind of existential type, which justifies the fat
pointer: `exist p. p and (p to T(p))`: two words, on of type `p` and one of type
`(p to T(p))`.

Should trait be reconstructed that way?

Note that recursion in traits gives something ambiguous. Say:
`trait list <a> { ... tail : list<a> }`... we cannot see here that tail should
be the same implementation of the trait, and maybe there are use cases for both.

### Higher kinded types

Not such a great issue?

What was it again? Everything should end in 'type', so we might as well treat
them like sets of types. you get: `cons = { a | a and (false or a in list) }`

This is required because most other constructions only work with the types
themselves.

The higher kinded types are needed to have functors etc.

Higher kinderd types add levels of abstraction, but do they express features of
the runtime? Features that are not otherwise supported? It is a high level way
to talk about traits, which may be well supported with the fat pointer
interpretation actually.

We are talking about functions that manufacture traits out of traits, actually,
perhaps taking trait functions as arguments. Traits could almost be first class
objects, except all of this happens at compile, so not quite first class.
Perhaps this could be achieved with annotations and the like.

Note: perhaps all of this just means that higher kinded types are erased by the
compiler, and hence don't impact the design of the virtual machine. When `map`
is collect for a functor, the cmompile has to resolve that function. The type
system is supposed to help with that.

### recap

Every function resides in static memory anyway, not debate about that. The
proposal is that basic object types are just structs allocated on the heap. They
are never supposed to ever hold any function pointers. To support objects with
virtual methods and closures, there are the fat pointers, where one part takes
care of heap allocated data, and the second part of the collection of function
pointers that can be applied to the data. The pointer only has to be fat of nu
specific implementation is chosen, of course.

The heap can hold pointers to other objects on the heap. Fields of generic type
are supported that way, and members of trait type and recursion.

The higher kind hierarchy gives types to higher order type valued functions,
roughly. Logically, they can manipulate the map of method pointers in all of the
standard ways, but there is a whole calculus involved in evaluating these at
compile time.

A, the type class of functor does realy do anything, it is simply a type for a
function pointer. Functors would not be first class, all that you would have is
a placeholder. The map could be added to the vtables of certain types, however.

### stack trick

If an object can be collected at the end of a method, just allocate it on the
stack? Perhaps rust does it that way already. No, I don't want the user to be in
control of it, so the compiler has to make the decision, which leads to extra
typing, since each function that is called that gets a hold of the object must
allow the object to be collected.

### function pointers

That will end up on the heap. When a class specifices a generic field, and the
object gets allocated on the heap, there the function pointer goes. What remains
is the rule: interface fat pointer, implementation thin pointer.

## 2024-2-11

Name every type you use, this is not optional. So in
`the [type] is [term] in [term]` the type has to be a variable. If it is not,
then there should be an assignment of a type variable
`a [name] is a [type] in [term]`.

### images again

So we do just have a general space of objects, in which an object is something
that is allocated on the heap, which contains instance data, and pointers to a
collection of methods in static memory. The image of any function that produces
objects can be a class of object. Of course, these types may not be very
interesting of the function produces objects with disjoint interfaces.

On top of this, unions of classes are needed, which is the only thing i really
want. These unions are discriminated automartically, by the pointer to static
memory.

That static memory construct, like offsets, names and and types for various
fields, methods...

Note, no departure form interfaces or traits or anything, though that could be
interesting right? A trait implementation could be non trivial, but then we'd
need the fat pointers to make them work.

Insight into the reasons for fat pointers. Each class can only carry so many
functions with it, and has to fit the interface precisely. The fat pointers add
implementations to make objects fit interfaces. Perhaps the pointers can still
be thin in some cases.

### different take

Dedicate to dynamic dispatch, means fat pointers everywhere. Trait
implementations for every function. In other words: a object is always just a
pointer to the heap. Every method is defined by a second pointer into static
memory, that explains the implementation of methods and fields.

How bad this really is depends on how many implementations of the same interface
are available, and if the images are still there, the thin pointer is
sufficient, since those types have only one implementation.

## 2024-2-10

Unrelated thinking. Well, this is about combining this project with nominal.

### encapsulated types

To hide implementation in second order propositional logic, let the
implementation types be local variables that go out of scope, while only
exporting or publishing an existential type or an interface. So there is a
structural type that gvein information on how data is allocated and released,
but it isn't available to the user. The existential case comes down to merely
sharing the information that a type is there. The other option is to use another
structural type, like a record that has the public fields an methods, but
nothing else.

It should be possible for an implementation to use several types, but present as
a single type to the outside world. The joint image types may not the wrong
construct.

### experiment with red black tree

Classes have a specific memory layout, but types can be unions of classes
without limit. Those unions would introduce a new encapsulation level, but it
could be the friendly

Or maybe there should be a destinction between structs and traits.

## 2024-2-3

Three operator system:

- `$` drop context [ab] -> [b]
- `\` move [a]bc -> [ba]c
- `@` copy [ab]c -> [ab]ac

This appears to be a mimimal functional set.

## 2024-1-27

New option found:

```
x [a:b] c => a(x) c
$M [a:b] c => M [b]
\M [a] b:c => M [b:a] c
x = M, N [a:b] c => N [a+{x: m[a:b]}:b] c
M. [a:b] c => M[a:b] a:c

x [n] c => $^nx c
$M [n] c => M [n+1]
x = M, N [n] c => N [{x: m[a:b]}:n+1] c
M. [n] c => M[n] {}:c
```

## 2024-1-25

Idea: reduce bookkeeping by taking for granted that functions work on tuplet of
data with named fields. To make this work, add something of deBruin indices. The
result:

```
x [a:b] c => a(x) c
$M [a:b] c => M [b]
\M [a] b:c => M [b:a] c
x = M, N [a] b:c => N [a] b+{x: m[a:b]}:c
M. [a] b => M[a] {}:b
```
