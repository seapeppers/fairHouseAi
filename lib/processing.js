const DEMOGRAPHIC_DOCUMENT = /demographic/i;
const RESULTS_SUFFIX = "check_result.json";

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
  return item.type === "file" && !DEmographic(item.name) && !isResultFile(item.name);
}

function DEmographic(name) {
  return DEMOGRAPHIC_DOCUMENT.test(name || "");
}

export function buildExtractionFields(fileName) {
  return [
    { key: "document_type", type: "string", prompt: `Identify the document type for ${fileName}.` },
    { key: "applicant_name", type: "string", prompt: "Extract the applicant or household member name, if present." },
    { key: "unit", type: "string", prompt: "Extract the unit number, if present." },
    { key: "household_size", type: "number", prompt: "Extract the household size as a number, if present." },
    { key: "unit_ami_pct", type: "number", prompt: "Extract the unit AMI percentage as a number, if present." },
    { key: "statement_month", type: "string", prompt: "For a bank statement, extract the statement month name; otherwise leave blank." },
    { key: "hourly_rate", type: "number", prompt: "Extract the current gross hourly wage rate as a number, if present." },
    { key: "annual_wage_income", type: "number", prompt: "Extract stated annual gross wage income as a number, if present." },
    { key: "pay_frequency", type: "string", prompt: "Extract pay frequency: weekly, bi-weekly, semi-monthly, or monthly, if present." },
    { key: "year_to_date_gross", type: "number", prompt: "Extract year-to-date gross pay as a number, if present." },
    { key: "bank_deposits", type: "string", prompt: "Return a JSON array of bank deposits only: [{\"date\":\"YYYY-MM-DD\",\"description\":\"...\",\"amount\":123.45}]." },
    { key: "deposit_explanation_form_present", type: "boolean", prompt: "True only if this document is a Deposit Explanation Form." },
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

export function resultFileName(folderId) {
  return `${folderId}_${RESULTS_SUFFIX}`;
}

export function isResultFile(name) {
  return new RegExp(`^\\d+_${RESULTS_SUFFIX.replace(".", "\\.")}$`, "i").test(name || "");
}
