import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  comparePaneIds,
  extractPaneNumber,
  getPaneName,
  getPaneNameById,
  sortPaneIds,
} from "../src/utils.ts";

Deno.test("extractPaneNumber - extracts number from pane ID", () => {
  assertEquals(extractPaneNumber("%1"), 1);
  assertEquals(extractPaneNumber("%10"), 10);
  assertEquals(extractPaneNumber("%123"), 123);
  assertEquals(extractPaneNumber("invalid"), 0);
  assertEquals(extractPaneNumber(""), 0);
});

Deno.test("comparePaneIds - compares pane IDs numerically", () => {
  assertEquals(comparePaneIds("%1", "%2"), -1);
  assertEquals(comparePaneIds("%2", "%1"), 1);
  assertEquals(comparePaneIds("%1", "%1"), 0);
  assertEquals(comparePaneIds("%2", "%10"), -8);
  assertEquals(comparePaneIds("%10", "%2"), 8);
});

Deno.test("sortPaneIds - sorts pane IDs correctly", () => {
  const unsorted = [
    "%1",
    "%5",
    "%6",
    "%2",
    "%7",
    "%8",
    "%3",
    "%9",
    "%10",
    "%4",
    "%11",
    "%12",
  ];
  const expected = [
    "%1",
    "%2",
    "%3",
    "%4",
    "%5",
    "%6",
    "%7",
    "%8",
    "%9",
    "%10",
    "%11",
    "%12",
  ];
  const sorted = sortPaneIds(unsorted);

  assertEquals(sorted, expected);
});

Deno.test("sortPaneIds - handles empty array", () => {
  const sorted = sortPaneIds([]);
  assertEquals(sorted, []);
});

Deno.test("sortPaneIds - handles single element", () => {
  const sorted = sortPaneIds(["%5"]);
  assertEquals(sorted, ["%5"]);
});

Deno.test("sortPaneIds - specific pattern %1, %10, %2 sorts correctly", () => {
  // This tests the specific issue mentioned where %10 comes before %2 in string sort
  const unsorted = ["%1", "%10", "%2"];
  const expected = ["%1", "%2", "%10"];
  const sorted = sortPaneIds(unsorted);

  assertEquals(sorted, expected);
});

Deno.test("sortPaneIds - edge case with high numbers", () => {
  const unsorted = ["%100", "%2", "%10", "%1", "%20"];
  const expected = ["%1", "%2", "%10", "%20", "%100"];
  const sorted = sortPaneIds(unsorted);

  assertEquals(sorted, expected);
});

Deno.test("getPaneName - gets correct name by index", () => {
  assertEquals(getPaneName(0), "main");
  assertEquals(getPaneName(1), "manager1");
  assertEquals(getPaneName(2), "manager2");
  assertEquals(getPaneName(3), "secretary");
  assertEquals(getPaneName(4), "worker1");
});

Deno.test("getPaneName - handles out of range indices", () => {
  assertEquals(getPaneName(-1), "pane-1");
  // PANE_NAMES has 24 elements (index 0-23), so index 100 should be: 100 - 24 + 21 = 97
  assertEquals(getPaneName(100), "worker97");
});

Deno.test("getPaneNameById - gets correct name for pane ID", () => {
  const sortedPanes = ["%0", "%1", "%2", "%3"];
  assertEquals(getPaneNameById("%0", sortedPanes), "main");
  assertEquals(getPaneNameById("%1", sortedPanes), "manager1");
  assertEquals(getPaneNameById("%2", sortedPanes), "manager2");
  assertEquals(getPaneNameById("%3", sortedPanes), "secretary");
});

Deno.test("getPaneNameById - handles pane not in list", () => {
  const sortedPanes = ["%1", "%2"];
  assertEquals(getPaneNameById("%5", sortedPanes), "pane-1"); // index -1
});
