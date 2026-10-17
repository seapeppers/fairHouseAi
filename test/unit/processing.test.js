import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleDocument, parseWebhookEvent, reviewRequired } from "../../lib/processing.js";

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
