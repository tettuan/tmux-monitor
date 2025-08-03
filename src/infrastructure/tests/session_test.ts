import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TmuxSession } from "../session.ts";
import { MockLogger, SimpleCommandExecutor } from "../../core/test-utils.ts";

Deno.test("TmuxSession - create", () => {
  const session = TmuxSession.create(
    new SimpleCommandExecutor(),
    new MockLogger(),
  );
  assertExists(session);
});

Deno.test("TmuxSession - findMostActiveSession normal case", async () => {
  const session = TmuxSession.create(
    new SimpleCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data, "test-session"); // attached session takes priority
  }
});

Deno.test("TmuxSession - findMostActiveSession no sessions", async () => {
  const session = TmuxSession.create(
    new SimpleCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - findMostActiveSession command failure", async () => {
  const session = TmuxSession.create(
    new SimpleCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.findMostActiveSession();

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - getAllPanes normal case", async () => {
  const session = TmuxSession.create(
    new SimpleCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.length, 1);
    assertEquals(result.data[0].sessionName, "test-session");
    assertEquals(result.data[0].paneId, "%1");
  }
});

Deno.test("TmuxSession - getAllPanes command failure", async () => {
  const session = TmuxSession.create(
    new SimpleCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, false);
});

Deno.test("TmuxSession - getAllPanes invalid data", async () => {
  const session = TmuxSession.create(
    new SimpleCommandExecutor(),
    new MockLogger(),
  );

  const result = await session.getAllPanes("test-session");

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.length, 0); // Invalid data is excluded
  }
});
