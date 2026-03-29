import { inspectWorkerDiskRecovery } from "../recovery/worker-state-manifest.js";
import { parseCliArgs, readCliString } from "./cli.js";

async function main(): Promise<number> {
  const args = parseCliArgs(process.argv.slice(2));
  const journalPath =
    readCliString(args, "journal-path", process.env.JOURNAL_PATH ?? "data/journal.jsonl") ?? "data/journal.jsonl";
  const report = inspectWorkerDiskRecovery({ journalPath });
  const status = report.safeBoot ? "ready" : "not_ready";
  console.log(
    JSON.stringify(
      {
        status,
        safeBoot: report.safeBoot,
        bootCriticalMissing: report.bootCriticalMissing.map((artifact) => artifact.label),
        bootCriticalInvalid: report.bootCriticalInvalid.map((artifact) => ({
          label: artifact.label,
          error: artifact.validationError ?? "invalid",
        })),
        report,
      },
      null,
      2
    )
  );
  return report.safeBoot ? 0 : 2;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
