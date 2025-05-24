import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { Table } from "./table.ts";

Deno.test(function simpleCase() {
  const array = new Table<number>();
  for (let i = 0; i < 55; i++) {
    array.set(i, i);
  }
  for (let i = 0; i < 55; i++) {
    assertEquals(array.get(i), i);
  }
  const expected = [...Array(55).keys().map((i) => [i, i])];
  const actual = [...array.entries()];
  assertEquals(actual, expected);
});

Deno.test(function reverseOrder() {
  const array = new Table<number>();
  for (let i = 54; i >= 0; i--) {
    array.set(i, i);
  }
  for (let i = 0; i < 55; i++) {
    assertEquals(array.get(i), i);
  }
  const expected = [...Array(55).keys().map((i) => [i, i])];
  const actual = [...array.entries()];
  assertEquals(actual, expected);
});

Deno.test(function randomOrder() {
  const array = new Table<number>();
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
  assertEquals(actual, expected);
});

Deno.test(function deleteEveryThird() {
  const array = new Table<number>();
  for (let i = 0; i < 55; i++) {
    array.set(i, i);
  }
  for (let i = 0; i < 55; i += 3) {
    array.delete(i);
  }
  for (let i = 0; i < 55; i++) {
    assertEquals(array.get(i), i % 3 === 0 ? undefined : i);
  }
  const expected = [
    ...Array(55).keys().filter((i) => i % 3 !== 0).map((i) => [i, i]),
  ];
  const actual = [...array.entries()];
  assertEquals(actual, expected);
});
