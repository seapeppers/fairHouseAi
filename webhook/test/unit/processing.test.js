import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isEligibleDocument, isResultFile, parseWebhookEvent, resultFileName, reviewRequired } from "../../lib/processing.js";
import { calculateEligibility } from "../../lib/eligibility.js";
import incomeLimits from "../../../data/rules/income_limits_mfte_p7_2026.json" with { type: "json" };
import { handler, processWebhook, verifySignature } from "../../index.js";

test("parses a Box uploaded-file webhook", () => {
  assert.deepEqual(parseWebhookEvent({ body: { id: "evt-1", trigger: "FILE.UPLOADED", source: { id: "f-1", type: "file", name: "stub.pdf", parent: { id: "folder-1" } } } }), {
    eventId: "evt-1", fileId: "f-1", fileName: "stub.pdf", parentFolderId: "folder-1",
  });
});

test("rejects events other than a file upload", () => {
  assert.throws(() => parseWebhookEvent({ body: { trigger: "FILE.DOWNLOADED", source: {} } }));
});

test("excludes demographic forms and generated results", () => {
  assert.equal(isEligibleDocument({ type: "file", name: "resident_demographic_form.pdf" }), false);
  assert.equal(isEligibleDocument({ type: "file", name: "428478249320_check_result.json" }), false);
  assert.equal(isEligibleDocument({ type: "file", name: "paystubs_jul-sep_2026.pdf" }), true);
  assert.equal(isEligibleDocument({ type: "folder", name: "paystubs" }), false);
});

test("names one result file per household folder", () => {
  assert.equal(resultFileName("428478249320"), "428478249320_check_result.json");
  assert.equal(isResultFile("428478249320_check_result.json"), true);
  assert.equal(isResultFile("bank_statement_2026-07.pdf"), false);
});

// Extracts shaped like Box AI's answers for the demo households: values as printed.
const stub = (date, rate, net, ytd, page) => ({ page, pay_date: date, hourly_rate: rate, hours: "80.00", gross_pay: `$${(Number(rate.slice(1)) * 80).toFixed(2)}`, net_pay: net, ytd_gross: ytd });
const statement = (period, rows) => ({ file_id: period, extract: { document_type: "bank statement", statement_period: `Statement period: ${period}`, bank_deposits: JSON.stringify(rows) } });
const declaration = { file_id: "decl", extract: { document_type: "income declaration", applicant_name: "Maria Lopez", unit: "2A", household_size: "1", unit_ami_pct: "60", non_wage_income_declared: "None" } };
function household({ rate = "$24.00", net = "$1,581.12", deposit = "$1,581.12", extra = [], months = 3 } = {}) {
  // Year-to-date grows by one check's gross pay per stub, as on real stubs.
  const ytd = (i) => `$${(20000 + i * Number(rate.slice(1)) * 80).toFixed(2)}`;
  const stubs = [stub("July 03, 2026", rate, net, ytd(0), 1), stub("August 14, 2026", rate, net, ytd(1), 2), stub("September 25, 2026", rate, net, ytd(2), 3)];
  const periods = ["July 1, 2026 - July 31, 2026", "August 1, 2026 - August 31, 2026", "September 1, 2026 - September 30, 2026"].slice(0, months);
  return [
    declaration,
    { file_id: "stubs", extract: { document_type: "pay stubs", pay_stubs: JSON.stringify(stubs) } },
    ...periods.map((p, i) => statement(p, [{ date: `0${7 + i}/03/2026`, description: "EVERGREEN ROASTERS LLC PAYROLL DIRECT DEP", amount: deposit }, ...(extra[i] ?? [])])),
  ];
}

test("qualifies when wages match deposits and are under the limit", () => {
  const result = calculateEligibility("hh", household({ extra: [[{ date: "07/14/2026", description: "ONLINE RETAILER REFUND", amount: "$42.10" }]] }), incomeLimits);
  assert.equal(result.status, "QUALIFIES");
  assert.equal(result.projected_annual_income, 49920);
  assert.deepEqual(result.flags, []);
  assert.equal(result.income_limit, 69060);
  assert.ok(result.facts.some((f) => f.value === "$1,581.12" && f.context === "07/03/2026"));
  assert.ok(result.facts.some((f) => f.label === "Hourly rate (latest stub)" && f.page === 3));
});

test("one PDF with many stubs counts as three months of pay stubs", () => {
  const result = calculateEligibility("hh", household(), incomeLimits);
  assert.ok(!result.reasons.some((r) => /pay stubs cover/i.test(r)));
});

test("a missing bank statement is missing information", () => {
  const result = calculateEligibility("hh", household({ months: 2 }), incomeLimits);
  assert.equal(result.status, "MISSING_INFO");
  assert.match(result.reasons[0], /Only 2 of the 3/);
});

test("over the limit with nothing to review is not qualified", () => {
  const result = calculateEligibility("hh", household({ rate: "$40.00", net: "$2,635.20", deposit: "$2,635.20" }), incomeLimits);
  assert.equal(result.status, "NOT_QUALIFIED");
});

test("deposits that don't match the stubs, and undeclared recurring income, need review", () => {
  const zelle = (m) => [{ date: `0${m}/01/2026`, description: "ZELLE FROM R BROOKS", amount: "$1,500.00" }];
  const result = calculateEligibility("hh", household({ rate: "$20.00", net: "$1,317.60", deposit: "$1,844.64", extra: [zelle(7), zelle(8), zelle(9)] }), incomeLimits);
  assert.equal(result.status, "NEEDS_REVIEW");
  assert.equal(result.projected_annual_income, 76240); // $28.00 x 2080 + $1,500 x 3 x 4
  assert.ok(result.reasons.some((r) => /match \$28\.00\/hr/.test(r)));
  assert.ok(result.reasons.some((r) => /not declared/.test(r)));
  assert.ok(result.reasons.some((r) => /Deposit Explanation Form/.test(r)));
  assert.equal(result.flags.length, 4);
});

test("updates the household's one result file and ignores its own uploads", async () => {
  process.env.BOX_RESULTS_FOLDER_ID = "results";
  const uploaded = [];
  const existing = { id: "report-1", type: "file", name: "hh-folder_check_result.json" };
  const box = {
    folders: { getFolderItems: async (id) => ({ entries: id === "results" ? [existing] : [
      { id: "stubs", type: "file", name: "paystubs.pdf" },
      { id: "demo", type: "file", name: "resident_demographic_form.pdf" },
    ] }) },
    ai: { createAiExtractStructured: async ({ items, aiAgent }) => {
      assert.notEqual(items[0].id, "demo", "the demographic form must never be extracted");
      assert.equal(aiAgent.basicText.model, "aws__claude_4_5_sonnet");
      return { answer: { document_type: "pay stubs" } };
    } },
    uploads: {
      uploadFile: async () => { throw new Error("should update the existing result"); },
      uploadFileVersion: async (fileId, body) => { uploaded.push({ fileId, body }); return {}; },
    },
  };
  const bedrock = { send: async () => ({ output: { message: { content: [{ text: '\n\n```json\n{"items":[]}\n```' }] } } }) };
  const event = (name, parent) => ({ body: JSON.stringify({ id: "e", trigger: "FILE.UPLOADED", source: { id: "f", type: "file", name, parent: { id: parent } } }) });
  const result = await processWebhook(event("paystubs.pdf", "hh-folder"), { box, bedrock });
  assert.deepEqual([result.reportFileId, result.updated, uploaded[0].body.attributes.name], ["report-1", true, "hh-folder_check_result.json"]);
  assert.equal((await processWebhook(event("hh-folder_check_result.json", "results"), { box, bedrock })).ignored, true);
  delete process.env.BOX_RESULTS_FOLDER_ID;
});

test("routes decision items to manual review", () => {
  assert.equal(reviewRequired({ manual_review_required: false, items: [{ file_id: "1" }] }), true);
  assert.equal(reviewRequired({ manual_review_required: false, items: [] }), false);
});

test("verifies a Box primary signature from lowercased HTTP API headers", () => {
  const body = '{"trigger":"FILE.UPLOADED"}';
  const key = "test-webhook-key";
  const deliveryTimestamp = "2026-10-17T17:19:02Z";
  const signature = crypto.createHmac("sha256", key).update(body).update(deliveryTimestamp).digest("base64");
  const originalKey = process.env.BOX_WEBHOOK_PRIMARY_KEY;
  process.env.BOX_WEBHOOK_PRIMARY_KEY = key;
  assert.equal(verifySignature({
    "box-signature-primary": signature,
    "box-delivery-timestamp": deliveryTimestamp,
  }, Buffer.from(body)), true);
  if (originalKey === undefined) delete process.env.BOX_WEBHOOK_PRIMARY_KEY;
  else process.env.BOX_WEBHOOK_PRIMARY_KEY = originalKey;
});

test("rejects an invalid Box primary signature without invoking processing", async () => {
  const originalKey = process.env.BOX_WEBHOOK_PRIMARY_KEY;
  process.env.BOX_WEBHOOK_PRIMARY_KEY = "test-webhook-key";
  const response = await handler({
    body: '{"trigger":"FILE.UPLOADED"}',
    headers: {
      "box-signature-primary": "invalid",
      "box-delivery-timestamp": "2026-10-17T17:19:02Z",
    },
  });
  assert.equal(response.statusCode, 401);
  if (originalKey === undefined) delete process.env.BOX_WEBHOOK_PRIMARY_KEY;
  else process.env.BOX_WEBHOOK_PRIMARY_KEY = originalKey;
});

test("verifies the decoded raw API Gateway payload", () => {
  const body = '{"trigger":"FILE.UPLOADED"}';
  const key = "test-webhook-key";
  const deliveryTimestamp = "2026-10-17T17:19:02Z";
  const signature = crypto.createHmac("sha256", key).update(body).update(deliveryTimestamp).digest("base64");
  const originalKey = process.env.BOX_WEBHOOK_PRIMARY_KEY;
  process.env.BOX_WEBHOOK_PRIMARY_KEY = key;
  const apiGatewayBody = Buffer.from(body).toString("base64");
  assert.equal(verifySignature({
    "box-signature-primary": signature,
    "box-delivery-timestamp": deliveryTimestamp,
  }, Buffer.from(apiGatewayBody, "base64")), true);
  if (originalKey === undefined) delete process.env.BOX_WEBHOOK_PRIMARY_KEY;
  else process.env.BOX_WEBHOOK_PRIMARY_KEY = originalKey;
});
