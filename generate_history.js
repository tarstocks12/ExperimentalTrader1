import fs from "fs/promises";
import { computeGenuineWalkForwardAudit, mergeVerifiedAuditLogs } from "./src/lib/walk-forward-audit.js";
import { VERIFIED_AUDIT_BASELINE } from "./src/data/verified-audit-baseline.js";
import { DEFAULT_PERSONAL_SYMBOLS } from "./src/data/watchlists.js";

const HISTORICAL_ASSESSMENTS_FILE = "historical_assessments_FNO.json";

export async function generateHistoryFile() {
  let existing = [];
  try {
    const raw = await fs.readFile(HISTORICAL_ASSESSMENTS_FILE, "utf-8");
    existing = JSON.parse(raw);
  } catch {
    existing = [];
  }

  const mergedBase = mergeVerifiedAuditLogs(VERIFIED_AUDIT_BASELINE, existing);
  const updated = await computeGenuineWalkForwardAudit(DEFAULT_PERSONAL_SYMBOLS, mergedBase, 50);

  const jsonStr = JSON.stringify(updated, null, 2);
  await fs.writeFile("historical_assessments_FNO.json", jsonStr);
  await fs.writeFile("historical_assessments_Personal.json", jsonStr);
  await fs.writeFile("historical_assessments_Nifty500.json", jsonStr);
  await fs.writeFile("historical_assessments.json", jsonStr);
  return updated;
}
