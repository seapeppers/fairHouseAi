import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { BoxClient, BoxCcgAuth, BoxDeveloperTokenAuth, CcgConfig } from "box-node-sdk/sdk-gen";
import {
  buildExtractionFields,
  extractionAgent,
  isEligibleDocument,
  isResultFile,
  normalizeExtractResponse,
  parseWebhookEvent,
  resultFileName,
} from "./lib/processing.js";
import { calculateEligibility } from "./lib/eligibility.js";

// The Lambda zip carries data/rules next to index.js; in the repo it is one level up.
const rulesDir = new URL(existsSync(new URL("./data/rules", import.meta.url)) ? "./data/rules/" : "../data/rules/", import.meta.url);
const [rulesText, incomeLimits] = await Promise.all([
  readFile(new URL("rules.md", rulesDir), "utf8"),
  readFile(new URL("income_limits_mfte_p7_2026.json", rulesDir), "utf8").then(JSON.parse),
]);
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

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
  // Local runs can use a 60-minute developer token instead of the CCG app.
  if (process.env.BOX_DEVELOPER_TOKEN) {
    return new BoxClient({ auth: new BoxDeveloperTokenAuth({ token: process.env.BOX_DEVELOPER_TOKEN }) });
  }
  // BOX_CCG_* so they never clash with the sign-in app's BOX_CLIENT_ID in the shared .env.
  const auth = new BoxCcgAuth({
    config: new CcgConfig({
      clientId: required("BOX_CCG_CLIENT_ID"),
      clientSecret: required("BOX_CCG_CLIENT_SECRET"),
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

// Judgment calls only: the code has already done the math and the rule checks.
async function classify(extractions, report, bedrock) {
  const { facts, ...checked } = report;
  const prompt = [
    "You are FairHouse AI's reviewer for Seattle MFTE income files. Rules:",
    rulesText,
    "Plain code has already calculated income and run the rule checks; its result is below. Do not redo the math or repeat its findings.",
    "List only other problems a compliance analyst must look at: contradictions between documents, signs a document was altered, or income that is not accounted for. Ordinary items (refunds, transfers between own accounts, interest, omitted withdrawals) are not problems.",
    "Return JSON only with this exact shape: {\"items\":[{\"file_id\":string,\"reason\":string,\"severity\":\"low\"|\"medium\"|\"high\"}]}. Return {\"items\":[]} when there is nothing.",
    `Code result: ${JSON.stringify(checked)}`,
    `Extracts: ${JSON.stringify(extractions)}`,
  ].join("\n");
  const response = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    messages: [{ role: "user", content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 1000, temperature: 0 },
  }));
  const text = response.output?.message?.content?.find((part) => part.text)?.text;
  if (!text) throw new Error("Bedrock returned no decision text");
  // Models sometimes wrap the JSON in prose or a code fence; take the outermost object.
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
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

/** Check one household folder and write <folder id>_check_result.json to the results folder. */
async function processHousehold(householdFolderId, { box = createBoxClient(), bedrock = new BedrockRuntimeClient({}) } = {}) {
  const files = (await listFolderItems(box, householdFolderId)).filter(isEligibleDocument);
  const extractions = [];
  for (const file of files) {
    let result;
    try {
      result = await box.ai.createAiExtractStructured({
        items: [{ id: file.id, type: "file" }],
        fields: buildExtractionFields(file.name),
        aiAgent: extractionAgent(),
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
  const report = calculateEligibility(householdFolderId, extractions, incomeLimits);
  try {
    const classifier = await classify(extractions, report, bedrock);
    const serious = (classifier.items || []).filter((item) => item.severity !== "low");
    if (serious.length && report.status === "QUALIFIES") report.status = "NEEDS_REVIEW";
    report.reasons.push(...serious.map((item) => item.reason));
  } catch (error) {
    // The math and rule checks stand; a person looks at what the model could not.
    console.error("FairHouse Bedrock classification failed", JSON.stringify({
      householdFolderId,
      modelId: MODEL_ID,
      error: errorDiagnostic(error),
    }));
    if (report.status === "QUALIFIES") report.status = "NEEDS_REVIEW";
    report.reasons.push("The AI review step did not run; check the documents by hand.");
  }
  report.generated_at = new Date().toISOString();
  const destinationFolderId = process.env.BOX_RESULTS_FOLDER_ID || householdFolderId;
  const resultName = resultFileName(householdFolderId);
  const destinationItems = await listFolderItems(box, destinationFolderId);
  const existing = destinationItems.find((item) => item.type === "file" && item.name === resultName);
  let reportFileId;
  try {
    reportFileId = await writeResult(box, destinationFolderId, resultName, report, existing);
  } catch (error) {
    console.error("FairHouse report upload failed", JSON.stringify({
      householdFolderId,
      destinationFolderId,
      error: errorDiagnostic(error),
    }));
    throw error;
  }
  return { reportFileId, householdFolderId, status: report.status, updated: Boolean(existing), report };
}

async function processWebhook(event, deps = {}) {
  const uploaded = parseWebhookEvent(event);
  // Our own result files must never trigger another run, or the webhook would loop.
  if (isResultFile(uploaded.fileName) || uploaded.parentFolderId === process.env.BOX_RESULTS_FOLDER_ID) {
    return { ignored: true, reason: "FairHouse result file" };
  }
  console.info("FairHouse webhook processing started", JSON.stringify({
    eventId: uploaded.eventId,
    fileId: uploaded.fileId,
    parentFolderId: uploaded.parentFolderId,
  }));
  const { report, ...result } = await processHousehold(uploaded.parentFolderId, deps);
  return result;
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

export { createBoxClient, processHousehold, processWebhook, verifySignature };
