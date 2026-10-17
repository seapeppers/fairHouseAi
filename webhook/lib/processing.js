const DEMOGRAPHIC_DOCUMENT = /demographic/i;
const RESULT_FILE = /_check_result\.json$/i;

export function parseWebhookEvent(event) {
  const payload = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  if (payload?.trigger !== "FILE.UPLOADED" || payload?.source?.type !== "file") {
    throw new Error("Only Box FILE.UPLOADED events with a file source are supported");
  }
  const parentFolderId = payload.source.parent?.id;
  if (!payload.source.id || !parentFolderId) throw new Error("Webhook file source must include id and parent folder id");
  return { eventId: payload.id, fileId: payload.source.id, fileName: payload.source.name, parentFolderId };
}

// Every file in a household folder belongs to that household; the demographic form and
// our own results are never extracted.
export function isEligibleDocument(item) {
  return item.type === "file" && !DEMOGRAPHIC_DOCUMENT.test(item.name || "") && !isResultFile(item.name);
}

export function isResultFile(name) {
  return RESULT_FILE.test(name || "");
}

export function resultFileName(householdFolderId) {
  return `${householdFolderId}_check_result.json`;
}

// Values are asked for exactly as printed, so the backend can find them in the PDF and
// highlight them; plain code turns them into numbers.
export function buildExtractionFields(fileName) {
  return [
    { key: "document_type", type: "string", prompt: `Classify ${fileName} as exactly one of: pay stubs, bank statement, income declaration, deposit explanation form, other.` },
    { key: "applicant_name", type: "string", prompt: "The applicant or household member name, if present." },
    { key: "unit", type: "string", prompt: "The unit number (e.g. 2A), if present." },
    { key: "household_size", type: "string", prompt: "The household size as a plain number, if present." },
    { key: "unit_ami_pct", type: "string", prompt: "The unit's AMI income restriction as a plain number (e.g. 60), if present." },
    { key: "non_wage_income_declared", type: "string", prompt: "For an income declaration, the non-wage income declared, copied exactly as printed (e.g. None)." },
    { key: "statement_period", type: "string", prompt: "For a bank statement, the statement period line copied exactly as printed; otherwise blank." },
    { key: "pay_stubs", type: "string", prompt: "For pay stubs, a JSON array with one object per earnings statement in the document, in order: [{\"page\": 1-based page number, \"pay_date\": as printed, \"hourly_rate\": as printed, \"hours\": as printed, \"gross_pay\": as printed, \"net_pay\": as printed, \"ytd_gross\": as printed}]. Otherwise []." },
    { key: "bank_deposits", type: "string", prompt: "For a bank statement, a JSON array of every deposit: [{\"date\": as printed, \"description\": as printed, \"amount\": as printed}]. Otherwise []." },
    { key: "evidence_quotes", type: "string", prompt: "A JSON array of the lines that prove the facts above, each copied character for character from the document: [{\"label\": short name, \"quote\": exact line}]. Include the hourly rate, net pay, year-to-date gross, household size, AMI restriction, gross annual wage income and statement period lines when present." },
  ];
}

export function extractionAgent(model = process.env.BOX_AI_MODEL || "aws__claude_4_5_sonnet") {
  return { type: "ai_agent_extract_structured", basicText: { model }, longText: { model } };
}

export function normalizeExtractResponse(result) {
  const answer = result?.answer ?? result;
  if (answer === null || typeof answer !== "object") return { raw: String(answer) };
  return Object.fromEntries(Object.entries(answer).filter(([key]) => key !== "rawData" && key !== "raw_data"));
}

export function reviewRequired(decision) {
  return decision?.manual_review_required === true || (decision?.items || []).length > 0;
}
