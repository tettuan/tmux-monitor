import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("basic test", () => {
  assertEquals(1 + 1, 2);
});

Deno.test("hello world test", () => {
  const greeting = "Hello, Deno!";
  assertEquals(greeting.length, 12);
});
