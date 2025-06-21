import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { reverse, UIntSet } from "./uintset.ts";

Deno.test("expected behavior", () => {
  const numbers = new Set(
    Array(1000).keys().map((i) => (997 + 7919 * i) % 1e5),
  );
  const natSet = new UIntSet();
  for (const number of numbers) {
    natSet.add(number);
  }

  for (const number of numbers) {
    assert(natSet.has(number));
  }

  for (const number of natSet.iterate()) {
    assert(numbers.has(number));
  }

  for (const number of numbers) {
    natSet.remove(number);
  }

  for (const number of natSet.iterate()) {
    assert(!numbers.has(number));
  }

  assert(natSet.isEmpty());
});

Deno.test("scatter nats", () => {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 32; i++) {
    a.push(reverse(1 << i));
    b.push(2 ** (31 - i));
  }
  assertEquals(a, b);
});
