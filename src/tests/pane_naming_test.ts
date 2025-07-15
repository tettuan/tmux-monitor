import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PaneNamingService } from "../domain/services.ts";
import { Pane } from "../domain/pane.ts";

Deno.test("PaneNamingService - sequential assignment with sorted panes", () => {
  // Create test panes in various ID orders
  const pane0Result = Pane.fromTmuxData("%0", true, "bash", "main");
  const pane1Result = Pane.fromTmuxData("%1", false, "vim", "editor");
  const pane2Result = Pane.fromTmuxData("%2", false, "node", "server");
  const pane10Result = Pane.fromTmuxData("%10", false, "code", "vscode");

  // All panes should be created successfully
  assertEquals(pane0Result.ok, true);
  assertEquals(pane1Result.ok, true);
  assertEquals(pane2Result.ok, true);
  assertEquals(pane10Result.ok, true);

  if (pane0Result.ok && pane1Result.ok && pane2Result.ok && pane10Result.ok) {
    // Sort panes by ID (this simulates the sorting in MonitoringApplicationService)
    const panes = [
      pane0Result.data,
      pane1Result.data,
      pane2Result.data,
      pane10Result.data,
    ];
    const sortedPanes = panes.sort((a, b) => {
      const aNum = parseInt(a.id.value.replace("%", ""), 10);
      const bNum = parseInt(b.id.value.replace("%", ""), 10);
      return aNum - bNum;
    });

    // Assign sequential names
    const assignmentResult = PaneNamingService.assignSequentialNames(
      sortedPanes,
    );
    assertEquals(assignmentResult.ok, true);

    if (assignmentResult.ok) {
      const assignments = assignmentResult.data;

      // Verify assignments follow the expected order
      assertEquals(assignments.get("%0")?.value, "main");
      assertEquals(assignments.get("%1")?.value, "manager1");
      assertEquals(assignments.get("%2")?.value, "manager2");
      assertEquals(assignments.get("%10")?.value, "secretary");
    }
  }
});

Deno.test("PaneNamingService - handles more panes than configured names", () => {
  // Create many panes to exceed PANE_NAMES array length
  const panes = [];
  for (let i = 0; i < 30; i++) {
    const paneResult = Pane.fromTmuxData(`%${i}`, i === 0, "bash", `pane${i}`);
    if (paneResult.ok) {
      panes.push(paneResult.data);
    }
  }

  assertEquals(panes.length, 30);

  // Sort panes by ID
  const sortedPanes = panes.sort((a, b) => {
    const aNum = parseInt(a.id.value.replace("%", ""), 10);
    const bNum = parseInt(b.id.value.replace("%", ""), 10);
    return aNum - bNum;
  });

  const assignmentResult = PaneNamingService.assignSequentialNames(sortedPanes);
  assertEquals(assignmentResult.ok, true);

  if (assignmentResult.ok) {
    const assignments = assignmentResult.data;

    // Verify first few follow PANE_NAMES
    assertEquals(assignments.get("%0")?.value, "main");
    assertEquals(assignments.get("%1")?.value, "manager1");
    assertEquals(assignments.get("%2")?.value, "manager2");
    assertEquals(assignments.get("%3")?.value, "secretary");
    assertEquals(assignments.get("%4")?.value, "worker1");

    // Verify later ones use dynamic generation
    // %24 is at index 24 in sorted array → worker21 (24 - 24 + 21 = 21)
    assertEquals(assignments.get("%24")?.value, "worker21");
    // %25 is at index 25 in sorted array → worker22 (25 - 24 + 21 = 22)
    assertEquals(assignments.get("%25")?.value, "worker22");
    // %29 is at index 29 in sorted array → worker26 (29 - 24 + 21 = 26)
    assertEquals(assignments.get("%29")?.value, "worker26");
  }
});

Deno.test("PaneNamingService - validates active pane manager role", () => {
  // Create panes where an active pane would get a worker role at a high index
  const inactivePanes = [];
  // Create enough inactive panes to push active pane to worker role
  for (let i = 0; i < 5; i++) {
    const paneResult = Pane.fromTmuxData(`%${i}`, false, "bash", `pane${i}`);
    if (paneResult.ok) {
      inactivePanes.push(paneResult.data);
    }
  }

  // Active pane that will be at index 5, which should get "worker2"
  const activePaneResult = Pane.fromTmuxData("%5", true, "bash", "main");

  assertEquals(activePaneResult.ok, true);
  assertEquals(inactivePanes.length, 5);

  if (activePaneResult.ok) {
    // Sort panes - active pane %5 will be at index 5, which gets "worker2"
    const allPanes = [...inactivePanes, activePaneResult.data];
    const sortedPanes = allPanes.sort((a, b) => {
      const aNum = parseInt(a.id.value.replace("%", ""), 10);
      const bNum = parseInt(b.id.value.replace("%", ""), 10);
      return aNum - bNum;
    });

    const assignmentResult = PaneNamingService.assignSequentialNames(
      sortedPanes,
    );

    // Should still succeed but with partial assignments
    assertEquals(assignmentResult.ok, true);

    if (assignmentResult.ok) {
      const assignments = assignmentResult.data;

      // First few inactive panes should get their assignments
      assertEquals(assignments.get("%0")?.value, "main");
      assertEquals(assignments.get("%1")?.value, "manager1");
      assertEquals(assignments.get("%2")?.value, "manager2");
      assertEquals(assignments.get("%3")?.value, "secretary");
      assertEquals(assignments.get("%4")?.value, "worker1");

      // Active pane with worker name should cause validation error and be excluded
      assertEquals(assignments.has("%5"), false);
    }
  }
});

Deno.test("PaneNamingService - handles empty pane array", () => {
  const assignmentResult = PaneNamingService.assignSequentialNames([]);
  assertEquals(assignmentResult.ok, true);

  if (assignmentResult.ok) {
    assertEquals(assignmentResult.data.size, 0);
  }
});
