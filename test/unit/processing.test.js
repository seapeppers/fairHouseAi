import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { isEligibleDocument, parseWebhookEvent, reviewRequired } from "../../lib/processing.js";
import { handler, verifySignature } from "../../index.js";

test("parses a Box uploaded-file webhook", () => {
  assert.deepEqual(parseWebhookEvent({ body: { id: "evt-1", trigger: "FILE.UPLOADED", source: { id: "f-1", type: "file", name: "stub.pdf", parent: { id: "folder-1" } } } }), {
    eventId: "evt-1", fileId: "f-1", fileName: "stub.pdf", parentFolderId: "folder-1",
  });
});

test("rejects events other than a file upload", () => {
  assert.throws(() => parseWebhookEvent({ body: { trigger: "FILE.DOWNLOADED", source: {} } }));
});

test("excludes demographic forms and generated reports", () => {
  assert.equal(isEligibleDocument({ type: "file", name: "resident_demographic_form.pdf" }), false);
  assert.equal(isEligibleDocument({ type: "file", name: "fairhouse-review-12.json" }), false);
  assert.equal(isEligibleDocument({ type: "file", name: "paystubs.pdf" }), true);
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
