import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { RedBlackTreeMap } from "./redBlack4.ts";

Deno.test(function simpleCase() {
  const array = new RedBlackTreeMap<number>();
  for (let i = 0; i < 55; i++) {
    array.set(i, i);
  }
  for (let i = 0; i < 55; i++) {
    assertEquals(array.get(i), i);
  }
  const expected = Array(55).keys().map((i) => [i, i]).toArray();
  const actual = [...array.entries()];
  actual.sort((a, b) => a[0] - b[0]);
  assertEquals(actual, expected);
});

Deno.test(function reverseOrder() {
  const array = new RedBlackTreeMap<number>();
  for (let i = 54; i >= 0; i--) {
    array.set(i, i);
  }
  for (let i = 0; i < 55; i++) {
    assertEquals(array.get(i), i);
  }
  const expected = [...Array(55).keys().map((i) => [i, i])];
  const actual = [...array.entries()];
  actual.sort((a, b) => a[0] - b[0]);
  assertEquals(actual, expected);
});

Deno.test(function randomOrder() {
  const array = new RedBlackTreeMap<number>();
  const entries = [...Array(31).keys()];
  while (entries.length > 0) {
    const i = Math.floor(entries.length * Math.random());
    array.set(entries[i], entries[i]);
    const e = entries.pop();
    if (i < entries.length) {
      entries[i] = e as number;
    }
  }
  for (let i = 0; i < 31; i++) {
    assertEquals(array.get(i), i);
  }
  const expected = [...Array(31).keys().map((i) => [i, i])];
  const actual = [...array.entries()];
  actual.sort((a, b) => a[0] - b[0]);
  assertEquals(actual, expected);
});

Deno.test(function removeEveryThird() {
  const array = new RedBlackTreeMap<number>();
  for (let i = 0; i < 31; i++) {
    array.set(i, i);
  }
  for (let i = 0; i < 31; i += 3) {
    array.remove(i);
  }
  for (let i = 0; i < 31; i++) {
    assertEquals(array.get(i), i % 3 === 0 ? undefined : i);
  }
  const expected = [
    ...Array(31).keys().map((i) => [i, i]).filter((
      [i, _],
    ) => i % 3 !== 0),
  ];
  const actual = [...array.entries()];
  actual.sort((a, b) => a[0] - b[0]);
  assertEquals(actual, expected);
});
