const MAX_DETAIL_LEN = 120;

/**
 * Strategy (apt prints root-cause errors before summaries):
 *   1. First `E:` line — the original error, not the meta-summary.
 *   2. Last non-empty line that contains at least one alphanumeric character.
 *   3. Empty string when stderr is blank.
 */
export function pickStderrDetail(stderr: string): string {
  const lines = stderr
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return "";

  const firstErr = lines.find((l) => l.startsWith("E:"));
  if (firstErr) return cap(firstErr);

  const meaningful = lines.filter((l) => /[a-z0-9]/i.test(l));
  const picked = meaningful.length > 0 ? meaningful[meaningful.length - 1] : lines[lines.length - 1];
  return cap(picked);
}

function cap(s: string): string {
  return s.length > MAX_DETAIL_LEN ? `${s.slice(0, MAX_DETAIL_LEN - 1)}…` : s;
}
