import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { NumberTrie } from "./numberTrie.ts";

Deno.test(function simpleCase() {
  let array = NumberTrie.empty<number>();
  for (let i = 0; i < 31; i++) {
    array = array.set(i, i);
  }
  const expected = Array.from({ length: 31 }).map((_, i) => [i, i]);
  const actual = [...array.entries()];
  assertEquals(actual, expected);
  for (let i = 0; i < 31; i++) {
    assertEquals(array.get(i), i);
  }
});

Deno.test(function reverseOrder() {
  let array = NumberTrie.empty<number>();
  for (let i = 30; i >= 0; i--) {
    array = array.set(i, i);
  }
  const expected = Array.from({ length: 31 }).map((_, i) => [i, i]);
  const actual = [...array.entries()];
  assertEquals(actual, expected);
  for (let i = 0; i < 31; i++) {
    assertEquals(array.get(i), i);
  }
});

Deno.test(function randomOrder() {
  let array = NumberTrie.empty<number>();
  const entries = Array.from({ length: 31 }).map((_, i) => i);
  while (entries.length > 0) {
    const i = Math.floor(entries.length * Math.random());
    array = array.set(entries[i], entries[i]);
    const e = entries.pop() as number;
    if (i < entries.length) {
      entries[i] = e;
    }
  }
  const expected = Array.from({ length: 31 }).map((_, i) => [i, i]);
  const actual = [...array.entries()];
  assertEquals(actual, expected);
  for (let i = 0; i < 31; i++) {
    assertEquals(array.get(i), i);
  }
});

Deno.test(function deleteEveryThird() {
  let array = NumberTrie.empty<number>();
  for (let i = 0; i < 31; i++) {
    array = array.set(i, i);
  }
  for (let i = 0; i < 31; i += 3) {
    array = array.delete(i);
  }
  const expected = Array.from({ length: 31 }).map((_, i) => [i, i]).filter((
    [i, _],
  ) => i % 3 !== 0);
  const actual = [...array.entries()];
  assertEquals(actual, expected);
  for (let i = 0; i < 31; i++) {
    assertEquals(array.get(i), i % 3 === 0 ? undefined : i);
  }
});
