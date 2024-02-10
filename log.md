# Scryptic

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
