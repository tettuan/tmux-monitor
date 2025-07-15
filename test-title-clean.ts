#!/usr/bin/env deno run

// テスト用のPaneTitleManagerのcleanTitleメソッドをテスト

class TestTitleCleaner {
  cleanTitle(title: string): string {
    if (!title) return "";

    let cleaned = title;
    let previousLength = 0;

    // Keep cleaning until no more changes occur (handles multiple prefixes and role duplications)
    while (cleaned.length !== previousLength) {
      previousLength = cleaned.length;

      // Remove status prefixes like [WORKING], [IDLE], [TERMINATED], etc.
      // Also remove status with timestamps like [DONE 07/14 22:08]
      cleaned = cleaned.replace(
        /^\[(?:WORKING|IDLE|TERMINATED|DONE|UNKNOWN)(?:\s+\d{2}\/\d{2}\s+\d{2}:\d{2})?\]\s*/,
        "",
      ).trim();

      // Remove repeated role names like "manager1: manager1: manager1:"
      // Match any word followed by colon that repeats
      cleaned = cleaned.replace(
        /^(\w+):\s*(\1:\s*)+/g,
        "$1: ",
      ).trim();

      // Remove repeated role names like "worker3: worker3: worker3:"
      cleaned = cleaned.replace(
        /^(\w+\d*):\s*(\1:\s*)+/g,
        "$1: ",
      ).trim();
    }

    return cleaned;
  }
}

// テストケース
const cleaner = new TestTitleCleaner();

const testCases = [
  "[IDLE] manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: manager1: ✳ Validator Error",
  "[IDLE] worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: worker3: ✳ Work Assignment",
  "[IDLE] secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: secretary: ✳ 型エラー修正",
  "✳ File Access",
  "%5 WORKING - Working Pool",
  "[DONE 07/14 22:08]",
];

console.log("=== Title Cleaning Test ===");
for (const testCase of testCases) {
  const result = cleaner.cleanTitle(testCase);
  const finalTitle = result === "" ? testCase : result; // fallback logic
  console.log(`\nInput:  "${testCase}"`);
  console.log(`Cleaned: "${result}"`);
  console.log(`Final:   "${finalTitle}"`);
  console.log(`Length: ${testCase.length} → ${result.length}`);
}
