const DEMOGRAPHIC_DOCUMENT = /demographic/i;

export function parseWebhookEvent(event) {
  const payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  if (payload?.trigger !== "FILE.UPLOADED" || payload?.source?.type !== "file") {
    throw new Error("Only Box FILE.UPLOADED events with a file source are supported");
  }
  const parentFolderId = payload.source.parent?.id;
  if (!payload.source.id || !parentFolderId) throw new Error("Webhook file source must include id and parent folder id");
  return { eventId: payload.id, fileId: payload.source.id, fileName: payload.source.name, parentFolderId };
}

export function isEligibleDocument(item) {
  return item.type === "file" && !DEmographic(item.name) && !/^fairhouse-review-/i.test(item.name || "");
}

function DEmographic(name) {
  return DEMOGRAPHIC_DOCUMENT.test(name || "");
}

export function buildExtractionFields(fileName) {
  return [
    { key: "document_type", type: "string", prompt: `Identify the document type for ${fileName}.` },
    { key: "applicant_name", type: "string", prompt: "Extract the applicant or household member name, if present." },
    { key: "dates", type: "string", prompt: "Extract relevant statement, pay, or document dates." },
    { key: "income_evidence", type: "string", prompt: "Extract gross pay, pay frequency, benefits, and recurring deposits with source text." },
    { key: "bank_deposits", type: "string", prompt: "Extract deposits with date, amount, description, and source text." },
    { key: "missing_or_unclear", type: "string", prompt: "Identify missing, illegible, contradictory, or unclear evidence." },
  ];
}

export function normalizeExtractResponse(result) {
  const answer = result?.answer ?? result;
  if (answer === null || typeof answer !== "object") return { raw: String(answer) };
  return Object.fromEntries(Object.entries(answer).filter(([key]) => key !== "rawData" && key !== "raw_data"));
}

export function reviewRequired(decision) {
  return decision?.manual_review_required === true || (decision?.items || []).length > 0;
}
