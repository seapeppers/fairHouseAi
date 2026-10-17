import test from "node:test";
import assert from "node:assert/strict";
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
