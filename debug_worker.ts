const PANE_NAMES_LENGTH = 24;
console.log("PANE_NAMES_LENGTH:", PANE_NAMES_LENGTH);
for (let index = 23; index <= 26; index++) {
  const workerIndex = index - PANE_NAMES_LENGTH + 21;
  console.log(`index ${index}: worker${workerIndex}`);
}
