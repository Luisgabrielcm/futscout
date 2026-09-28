import { Readable } from "node:stream"
import { spec } from "node:test/reporters"

// Node 24 emits per-file summaries followed by a cumulative summary. Count
// actual tests, not the synthetic passing file Node reports for an empty file.
// Use structured events: console output from tests cannot spoof this gate.
export async function* requireExecutedTests(source) {
  let executed = 0
  for await (const event of source) {
    if (event.type === "test:summary") {
      if (event.data.file !== undefined) {
        const { passed, failed, cancelled } = event.data.counts
        executed += passed + failed + cancelled
      } else {
        if (executed === 0) {
          throw new Error("NO_TESTS_EXECUTED: no effective tests ran (empty, skipped or TODO-only run).")
        }
        executed = 0 // Each watch cycle must also execute at least one test.
      }
    }
    yield event
  }
}

export default async function* reporter(source) {
  // Keep Node's normal diagnostics and exit status for real test failures.
  yield* Readable.from(requireExecutedTests(source)).compose(new spec())
}
