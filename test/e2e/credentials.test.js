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

test("Box upload creates or updates the source folder result within one minute", { skip: !webhookE2eConfigured, timeout: 75_000 }, async () => {
  const client = createBoxClient();
  const sourceFolderId = "428511210357";
  const expectedReportName = `${sourceFolderId}_check_result.json`;
  const uploaded = await client.uploads.uploadFile({
    attributes: { name: `fairhouse-e2e-${Date.now()}.txt`, parent: { id: sourceFolderId } },
    file: Readable.from(Buffer.from("FairHouse webhook integration test")),
  });
  const uploadedFileId = uploaded.entries?.[0]?.id;
  assert.ok(uploadedFileId, "Box did not return the uploaded file ID");

  const deadline = Date.now() + 60_000;
  let report;
  while (Date.now() < deadline && !report) {
    const items = await client.folders.getFolderItems(process.env.BOX_RESULTS_FOLDER_ID, {
      queryParams: { fields: ["id", "name", "type"], limit: 1000 },
    });
    const resultFile = items.entries?.find((item) => item.type === "file" && item.name === expectedReportName);
    if (resultFile) {
      const stream = await client.downloads.downloadFile(resultFile.id);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const content = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (content.analyzed_file_ids?.includes(uploadedFileId)) report = content;
    }
    if (!report) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  assert.ok(report, `Result file did not include uploaded file ${uploadedFileId} within one minute`);
});
