import crypto from "node:crypto";
import { Readable } from "node:stream";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { BoxClient, BoxCcgAuth, CcgConfig } from "box-node-sdk/sdk-gen";
import {
  buildExtractionFields,
  isEligibleDocument,
  normalizeExtractResponse,
  parseWebhookEvent,
  reviewRequired,
} from "./lib/processing.js";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

function createBoxClient() {
  const auth = new BoxCcgAuth({
    config: new CcgConfig({
      clientId: required("BOX_CLIENT_ID"),
      clientSecret: required("BOX_CLIENT_SECRET"),
      enterpriseId: required("BOX_ENTERPRISE_ID"),
    }),
  });
  return new BoxClient({
    auth: process.env.BOX_USER_ID ? auth.withUserSubject(process.env.BOX_USER_ID) : auth,
  });
}

function verifySignature(headers, body) {
  const signature = headers?.["box-signature"] || headers?.["Box-Signature"];
  const deliveryTimestamp = headers?.["box-delivery-timestamp"] || headers?.["Box-Delivery-Timestamp"];
  if (!signature || !deliveryTimestamp) return false;
  const expected = crypto
    .createHmac("sha256", required("BOX_WEBHOOK_PRIMARY_KEY"))
    .update(`${body}${deliveryTimestamp}`)
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function decide(extractions, bedrock) {
  const prompt = [
    "You are FairHouse AI's review-routing agent.",
    "Decide whether extracted affordable-housing evidence needs human review.",
    "Never make an eligibility determination. Flag only missing, contradictory, low-confidence, or suspicious evidence.",
    "Return JSON only with this exact shape: {\"manual_review_required\":boolean,\"items\":[{\"file_id\":string,\"reason\":string,\"severity\":\"low\"|\"medium\"|\"high\"}]}",
    `Extracts: ${JSON.stringify(extractions)}`,
  ].join("\n");
  const response = await bedrock.send(new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID || "amazon.nova-2-lite-v1",
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 1000, temperature: 0 },
  }));
  const text = response.output?.message?.content?.find((part) => part.text)?.text;
  if (!text) throw new Error("Bedrock returned no decision text");
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
}

async function processWebhook(event, { box = createBoxClient(), bedrock = new BedrockRuntimeClient({}) } = {}) {
  const uploaded = parseWebhookEvent(event);
  const folderItems = await box.folders.getFolderItems(uploaded.parentFolderId, {
    queryParams: { fields: ["id", "type", "name", "parent"] },
  });
  const files = (folderItems.entries || []).filter(isEligibleDocument);
  const extractions = [];
  for (const file of files) {
    const result = await box.ai.createAiExtractStructured({
      items: [{ id: file.id, type: "file" }],
      fields: buildExtractionFields(file.name),
    });
    extractions.push({ file_id: file.id, file_name: file.name, extract: normalizeExtractResponse(result) });
  }
  const decision = await decide(extractions, bedrock);
  if (reviewRequired(decision) && process.env.BOX_REVIEWER_USER_ID) {
    const task = await box.tasks.createTask({
      item: { type: "file", id: uploaded.fileId },
      action: "review",
      message: "FairHouse AI identified evidence requiring manual review. See the uploaded audit report.",
      completionRule: "all_assignees",
    });
    await box.taskAssignments.createTaskAssignment({
      task: { type: "task", id: task.id },
      assignTo: { id: process.env.BOX_REVIEWER_USER_ID },
    });
  }
  const report = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    trigger: uploaded,
    extracts: extractions,
    manual_review: decision,
  };
  const destinationFolderId = process.env.BOX_RESULTS_FOLDER_ID || uploaded.parentFolderId;
  const uploadedReport = await box.uploads.uploadFile({
    attributes: { name: `fairhouse-review-${uploaded.fileId}.json`, parent: { id: destinationFolderId } },
    file: Readable.from(Buffer.from(JSON.stringify(report, null, 2))),
  });
  return { reportFileId: uploadedReport.entries?.[0]?.id, manualReviewRequired: reviewRequired(decision) };
}

export const handler = async (event) => {
  const body = typeof event.body === "string" ? event.body : JSON.stringify(event.body || {});
  if (!verifySignature(event.headers || {}, body)) return { statusCode: 401, body: "Invalid Box webhook signature" };
  try {
    const result = await processWebhook({ ...event, body });
    return { statusCode: 202, body: JSON.stringify(result) };
  } catch (error) {
    console.error("FairHouse webhook processing failed", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Webhook processing failed" }) };
  }
};

export { createBoxClient, processWebhook, verifySignature };
