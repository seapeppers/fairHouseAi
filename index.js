import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { BoxClient, BoxCcgAuth, CcgConfig } from "box-node-sdk/sdk-gen";
import {
  buildExtractionFields,
  isEligibleDocument,
  normalizeExtractResponse,
  parseWebhookEvent,
  resultFileName,
} from "./lib/processing.js";
import { calculateEligibility } from "./lib/eligibility.js";

const [rulesText, incomeLimits] = await Promise.all([
  readFile(new URL("./data/rules/rules.md", import.meta.url), "utf8"),
  readFile(new URL("./data/rules/income_limits_mfte_p7_2026.json", import.meta.url), "utf8").then(JSON.parse),
]);

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

function errorDiagnostic(error) {
  return {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    fault: error?.$fault,
    httpStatusCode: error?.$metadata?.httpStatusCode,
    requestId: error?.$metadata?.requestId,
  };
}

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
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers || {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const signature = normalizedHeaders["box-signature-primary"];
  const deliveryTimestamp = normalizedHeaders["box-delivery-timestamp"];
  if (!signature) {
    console.info("Box webhook signature diagnostic", JSON.stringify({
      headerNames: Object.keys(normalizedHeaders).sort(),
      bodyBytes: body.length,
      signaturePresent: false,
    }));
    return false;
  }
  if (!deliveryTimestamp) {
    console.info("Box webhook signature diagnostic", JSON.stringify({
      headerNames: Object.keys(normalizedHeaders).sort(),
      bodyBytes: body.length,
      signaturePresent: true,
      deliveryTimestampPresent: false,
    }));
    return false;
  }
  const expected = crypto
    .createHmac("sha256", required("BOX_WEBHOOK_PRIMARY_KEY"))
    .update(body)
    .update(deliveryTimestamp)
    .digest("base64");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  const matches = actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  console.info("Box webhook signature diagnostic", JSON.stringify({
    headerNames: Object.keys(normalizedHeaders).sort(),
    bodyBytes: body.length,
    signaturePresent: true,
    deliveryTimestampPresent: true,
    signatureLength: actualBuffer.length,
    signatureEncoding: /^[A-Za-z0-9+/]+={0,2}$/.test(signature) ? "base64-like" : "other",
    matches,
  }));
  return matches;
}

async function classify(extractions, bedrock) {
  const prompt = [
    "You are FairHouse AI's document classifier.",
    "Use the following Seattle MFTE rules as context. Extract facts only; do not calculate eligibility or invent facts.",
    rulesText,
    "Return JSON only with this exact shape: {\"items\":[{\"file_id\":string,\"reason\":string,\"severity\":\"low\"|\"medium\"|\"high\"}]}",
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

async function listFolderItems(box, folderId) {
  const response = await box.folders.getFolderItems(folderId, {
    queryParams: { fields: ["id", "type", "name", "parent"], limit: 1000 },
  });
  return response.entries || [];
}

async function writeResult(box, folderId, name, content, existing) {
  const file = Readable.from(Buffer.from(JSON.stringify(content, null, 2)));
  if (existing) {
    await box.uploads.uploadFileVersion(existing.id, { attributes: { name }, file });
    return existing.id;
  }
  const uploaded = await box.uploads.uploadFile({
    attributes: { name, parent: { id: folderId } },
    file,
  });
  return uploaded.entries?.[0]?.id;
}

async function processWebhook(event, { box = createBoxClient(), bedrock = new BedrockRuntimeClient({}) } = {}) {
  const uploaded = parseWebhookEvent(event);
  console.info("FairHouse webhook processing started", JSON.stringify({
    eventId: uploaded.eventId,
    fileId: uploaded.fileId,
    parentFolderId: uploaded.parentFolderId,
  }));
  const folderItems = await listFolderItems(box, uploaded.parentFolderId);
  const sourceResultName = resultFileName(uploaded.parentFolderId);
  const files = folderItems.filter((file) => isEligibleDocument(file) && file.name !== sourceResultName);
  const extractions = [];
  for (const file of files) {
    let result;
    try {
      result = await box.ai.createAiExtractStructured({
        items: [{ id: file.id, type: "file" }],
        fields: buildExtractionFields(file.name),
      });
    } catch (error) {
      console.error("FairHouse Box extraction failed", JSON.stringify({
        fileId: file.id,
        fileName: file.name,
        error: errorDiagnostic(error),
      }));
      throw error;
    }
    extractions.push({ file_id: file.id, file_name: file.name, extract: normalizeExtractResponse(result) });
  }
  let classifier;
  try {
    classifier = await classify(extractions, bedrock);
  } catch (error) {
    console.error("FairHouse Bedrock classification failed", JSON.stringify({
      fileId: uploaded.fileId,
      extractionCount: extractions.length,
      modelId: process.env.BEDROCK_MODEL_ID || "amazon.nova-2-lite-v1",
      error: errorDiagnostic(error),
    }));
    throw error;
  }
  const report = calculateEligibility(uploaded.parentFolderId, extractions, incomeLimits);
  report.analyzed_file_ids = extractions.map((item) => item.file_id);
  report.analyzed_file_names = extractions.map((item) => item.file_name);
  if (classifier.items?.length && report.status === "QUALIFIES") report.status = "NEEDS_REVIEW";
  report.reasons.push(...(classifier.items || []).map((item) => item.reason));
  const destinationFolderId = process.env.BOX_RESULTS_FOLDER_ID || uploaded.parentFolderId;
  const resultName = resultFileName(uploaded.parentFolderId);
  const destinationItems = await listFolderItems(box, destinationFolderId);
  const existing = destinationItems.find((item) => item.type === "file" && item.name === resultName);
  let reportFileId;
  try {
    reportFileId = await writeResult(box, destinationFolderId, resultName, report, existing);
  } catch (error) {
    console.error("FairHouse report upload failed", JSON.stringify({
      fileId: uploaded.fileId,
      destinationFolderId,
      error: errorDiagnostic(error),
    }));
    throw error;
  }
  return { reportFileId, folderId: uploaded.parentFolderId, status: report.status, updated: Boolean(existing) };
}

export const handler = async (event) => {
  const body = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(typeof event.body === "string" ? event.body : JSON.stringify(event.body || {}));
  const requestId = event.requestContext?.requestId;
  const signatureValid = verifySignature(event.headers || {}, body);
  console.info("FairHouse webhook received", JSON.stringify({
    requestId,
    bodyBytes: body.length,
    isBase64Encoded: Boolean(event.isBase64Encoded),
    signatureValid,
  }));
  if (!signatureValid) return { statusCode: 401, body: "Invalid Box webhook signature" };
  try {
    const result = await processWebhook({ ...event, body: body.toString("utf8") });
    return { statusCode: 202, body: JSON.stringify(result) };
  } catch (error) {
    console.error("FairHouse webhook processing failed", JSON.stringify({
      requestId,
      error: errorDiagnostic(error),
    }));
    return { statusCode: 500, body: JSON.stringify({ error: "Webhook processing failed" }) };
  }
};

export { createBoxClient, processWebhook, verifySignature };
