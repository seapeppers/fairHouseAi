import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isEligibleDocument, parseWebhookEvent, resultFileName, reviewRequired, submissionIdFromFileName } from "../../lib/processing.js";
import { calculateEligibility } from "../../lib/eligibility.js";
import incomeLimits from "../../data/rules/income_limits_mfte_p7_2026.json" with { type: "json" };
import { handler, processWebhook, verifySignature } from "../../index.js";

test("parses a Box uploaded-file webhook", () => {
  assert.deepEqual(parseWebhookEvent({ body: { id: "evt-1", trigger: "FILE.UPLOADED", source: { id: "f-1", type: "file", name: "stub.pdf", parent: { id: "folder-1" } } } }), {
    eventId: "evt-1", fileId: "f-1", fileName: "stub.pdf", parentFolderId: "folder-1",
  });
});

test("rejects events other than a file upload", () => {
  assert.throws(() => parseWebhookEvent({ body: { trigger: "FILE.DOWNLOADED", source: {} } }));
});

test("excludes demographic forms and generated reports", () => {
  assert.equal(isEligibleDocument({ type: "file", name: "ABCDE_resident_demographic_form.pdf" }), false);
  assert.equal(isEligibleDocument({ type: "file", name: "ABCDE_expected_results.json" }), false);
  assert.equal(isEligibleDocument({ type: "file", name: "ABCDE_paystubs.pdf" }), true);
  assert.equal(isEligibleDocument({ type: "file", name: "paystubs.pdf" }), false);
});

test("derives submission and result file names", () => {
  assert.equal(submissionIdFromFileName("AB12C_paystub.pdf"), "AB12C");
  assert.equal(submissionIdFromFileName("A12345_paystub.pdf"), undefined);
  assert.equal(resultFileName("AB12C"), "AB12C_expected_results.json");
});

test("calculates a qualifying result from structured extracts", () => {
  const extracts = [
    { extract: { document_type: "Bank Statement", applicant_name: "Maria Lopez", unit: "2A", household_size: 1, unit_ami_pct: 60, statement_month: "July", bank_deposits: [{ date: "2026-07-03", description: "PAYROLL DIRECT DEP", amount: 1200 }] } },
    { extract: { document_type: "Bank Statement", statement_month: "August", bank_deposits: [{ date: "2026-08-03", description: "PAYROLL DIRECT DEP", amount: 1200 }] } },
    { extract: { document_type: "Bank Statement", statement_month: "September", bank_deposits: [{ date: "2026-09-03", description: "PAYROLL DIRECT DEP", amount: 1200 }] } },
    { extract: { document_type: "Pay Stub", hourly_rate: 24 } },
    { extract: { document_type: "Pay Stub" } },
    { extract: { document_type: "Pay Stub" } },
  ];
  const result = calculateEligibility("ABCDE", extracts, incomeLimits);
  assert.equal(result.status, "QUALIFIES");
  assert.equal(result.projected_annual_income, 49920);
  assert.equal(result.income_limit, 69060);
});

test("updates one result file for multiple files sharing a submission prefix", async () => {
  const uploaded = [];
  const existing = { id: "report-1", type: "file", name: "ABCDE_expected_results.json" };
  const box = {
    folders: { getFolderItems: async () => ({ entries: [
      { id: "one", type: "file", name: "ABCDE_one.pdf" },
      { id: "two", type: "file", name: "ABCDE_two.pdf" },
      { id: "other", type: "file", name: "FGHIJ_other.pdf" },
      existing,
    ] }) },
    ai: { createAiExtractStructured: async ({ items }) => ({ answer: { document_type: "Pay Stub", applicant_name: "Maria", unit: "2A", household_size: 1, unit_ami_pct: 60, hourly_rate: 24, file_id: items[0].id } }) },
    uploads: {
      uploadFile: async () => { throw new Error("should update existing result"); },
      uploadFileVersion: async (fileId, body) => { uploaded.push({ fileId, body }); return {}; },
    },
  };
  const bedrock = { send: async () => ({ output: { message: { content: [{ text: '{"items":[]}' }] } } }) };
  const result = await processWebhook({ body: JSON.stringify({ id: "event", trigger: "FILE.UPLOADED", source: { id: "two", type: "file", name: "ABCDE_two.pdf", parent: { id: "input" } } }) }, { box, bedrock });
  assert.equal(result.reportFileId, "report-1");
  assert.equal(result.updated, true);
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].fileId, "report-1");
  assert.equal(uploaded[0].body.attributes.name, "ABCDE_expected_results.json");
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
