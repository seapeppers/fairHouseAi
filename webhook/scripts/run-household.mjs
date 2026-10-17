// Check household folders without a webhook: backfill files already in Box, or rerun one.
//
//   npm run check -- <household folder id> ...       check these folders
//   npm run check -- --all [--compare]               every unit folder in BOX_BUILDING_FOLDER_ID,
//                                                    compared with data/households/expected_results.json
//
// Auth: BOX_DEVELOPER_TOKEN, or the BOX_CCG_* app. Results go to BOX_RESULTS_FOLDER_ID.
import { readFileSync } from "node:fs";
import { createBoxClient, processHousehold } from "../index.js";

const args = process.argv.slice(2);
const box = createBoxClient();
let folders = args.filter((a) => !a.startsWith("--")).map((id) => ({ id }));
if (args.includes("--all")) {
  const building = process.env.BOX_BUILDING_FOLDER_ID;
  if (!building) throw new Error("--all needs BOX_BUILDING_FOLDER_ID");
  const items = await box.folders.getFolderItems(building, { queryParams: { fields: ["id", "type", "name"], limit: 1000 } });
  folders = items.entries.filter((i) => i.type === "folder" && /^Unit /.test(i.name)).map((i) => ({ id: i.id, name: i.name }));
}
if (!folders.length) throw new Error("Pass household folder ids, or --all");

const expected = JSON.parse(readFileSync(new URL("../../data/households/expected_results.json", import.meta.url), "utf8"));
let failures = 0;
for (const folder of folders) {
  const started = Date.now();
  const { status, report } = await processHousehold(folder.id, { box });
  const line = [`${folder.name ?? folder.id}: ${status}`, `income ${report.projected_annual_income} / limit ${report.income_limit}`,
    `${report.facts.length} facts`, `${((Date.now() - started) / 1000).toFixed(0)}s`];
  if (args.includes("--compare")) {
    const want = expected.find((e) => e.unit === report.unit || (folder.name ?? "").includes(e.name));
    const ok = want && want.status === status && want.projected_annual_income === report.projected_annual_income;
    if (!ok) failures++;
    line.unshift(ok ? "OK  " : "DIFF");
    if (!ok) line.push(`expected ${want?.status} ${want?.projected_annual_income}`);
  }
  console.log(line.join(" | "));
  for (const reason of report.reasons) console.log(`      - ${reason}`);
}
process.exit(failures ? 1 : 0);
