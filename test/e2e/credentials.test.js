import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createBoxClient } from "../../index.js";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";

const needed = ["BOX_CLIENT_ID", "BOX_CLIENT_SECRET", "BOX_ENTERPRISE_ID"];
const configured = needed.every((name) => process.env[name]);

test("Box CCG credentials can list the configured results folder", { skip: !configured }, async () => {
  const client = createBoxClient();
  const folderId = process.env.BOX_RESULTS_FOLDER_ID || "0";
  const folder = await client.folders.getFolderById(folderId);
  assert.equal(folder.type, "folder");
});

test("Bedrock Decider model accepts a minimal structured request", { skip: !process.env.AWS_REGION }, async () => {
  const client = new BedrockRuntimeClient({});
  const response = await client.send(new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID || "amazon.nova-2-lite-v1",
    messages: [{ role: "user", content: [{ text: "Return exactly {}" }] }],
    inferenceConfig: { maxTokens: 16, temperature: 0 },
  }));
  assert.ok(response.output?.message?.content?.[0]?.text);
});

const webhookE2eConfigured = configured
  && process.env.RUN_BOX_WEBHOOK_E2E === "1"
  && process.env.BOX_INPUTS_FOLDER_ID
  && process.env.BOX_RESULTS_FOLDER_ID;

test("Box uploads with the same submission prefix update one result file", { skip: !webhookE2eConfigured, timeout: 240_000 }, async () => {
  const client = createBoxClient();
  const prefix = `E${Date.now().toString(36).slice(-4)}`.toUpperCase();
  const expectedReportName = `${prefix}_expected_results.json`;
  const upload = async (suffix) => client.uploads.uploadFile({
    attributes: { name: `${prefix}_${suffix}.txt`, parent: { id: process.env.BOX_INPUTS_FOLDER_ID } },
    file: Readable.from(Buffer.from(`FairHouse webhook integration test: ${prefix} ${suffix}`)),
  });

  const first = await upload("one");
  assert.ok(first.entries?.[0]?.id, "Box did not return the first uploaded file ID");

  const deadline = Date.now() + 150_000;
  let report;
  while (Date.now() < deadline && !report) {
    const items = await client.folders.getFolderItems(process.env.BOX_RESULTS_FOLDER_ID, {
      queryParams: { fields: ["id", "name", "type"], limit: 1000 },
    });
    report = items.entries?.find((item) => item.type === "file" && item.name === expectedReportName);
    if (!report) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  assert.ok(report, `No webhook report appeared for submission ${prefix}`);
  const reportId = report.id;
  const second = await upload("two");
  assert.ok(second.entries?.[0]?.id, "Box did not return the second uploaded file ID");

  let updated;
  while (Date.now() < deadline && !updated) {
    const items = await client.folders.getFolderItems(process.env.BOX_RESULTS_FOLDER_ID, {
      queryParams: { fields: ["id", "name", "type", "modified_at"], limit: 1000 },
    });
    const matching = items.entries?.filter((item) => item.type === "file" && item.name === expectedReportName) || [];
    updated = matching.length === 1 && matching[0].id === reportId;
    if (!updated) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  assert.ok(updated, `Submission ${prefix} did not update exactly one result file`);
});
