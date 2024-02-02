# Scryptic

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
