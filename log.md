# Scryptic

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
