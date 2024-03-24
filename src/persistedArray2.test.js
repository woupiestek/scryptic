import { assertEquals } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { PersistentArray } from "./persistentArray2.ts";

Deno.test(function simpleCase() {
  let array = PersistentArray.empty();
  for (let i = 0; i < 31; i++) {
    array = array.set(i, i);
  }
  const expected = Array.from({ length: 31 }).map((_, i) => [i, i]);
  const actual = [...array.entries()];
  assertEquals(actual, expected);
  assertEquals(array.__depth(), 5);
  assertEquals(array.__imbalance(), 0);
});

Deno.test(function reverseOrder() {
  let array = PersistentArray.empty();
  for (let i = 30; i >= 0; i--) {
    array = array.set(i, i);
  }
  const expected = Array.from({ length: 31 }).map((_, i) => [i, i]);
  const actual = [...array.entries()];
  assertEquals(actual, expected);
  // worst case scenario
  console.log("unstable", array.__depth(), array.__imbalance());
  //   assertEquals(array.__depth(), 31);
  //   assertEquals(array.__imbalance(),30);
});

Deno.test(function randomOrder() {
  let array = PersistentArray.empty();
  const entries = Array.from({ length: 31 }).map((_, i) => i);
  while (entries.length > 0) {
    const i = Math.floor(entries.length * Math.random());
    array = array.set(entries[i], entries[i]);
    const e = entries.pop();
    if (i < entries.length) {
      entries[i] = e;
    }
  }
  const expected = Array.from({ length: 31 }).map((_, i) => [i, i]);
  const actual = [...array.entries()];
  assertEquals(actual, expected);
  console.log("unstable", array.__depth(), array.__imbalance());
});

// imbalance checks
// deletions!
Deno.test(function deleteEveryThird() {
  let array = PersistentArray.empty();
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
  assertEquals(array.__depth(), 5);
  assertEquals(array.__imbalance(), 0);
});
