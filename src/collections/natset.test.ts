import { assert } from "https://deno.land/std@0.178.0/testing/asserts.ts";
import { NatSet } from "./natset.ts";

Deno.test("expected behavior", () => {
  const numbers = new Set(
    Array(1000).keys().map((i) => (997 + 7919 * i) % 1e5),
  );
  const natSet = new NatSet();
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
