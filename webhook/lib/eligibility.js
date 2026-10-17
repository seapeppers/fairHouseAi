// Income math and checks in plain code (data/rules/rules.md section 4). The model only extracts.
const EXCLUDED_DEPOSIT = /refund|transfer|interest|reimbursement|card reward|tax refund|investment withdrawal/i;
const PAYROLL = /payroll|direct dep/i;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const HOURS_PER_YEAR = 2080;

export function money(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const match = String(value ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
}

// "07/03/2026", "July 03, 2026" or "2026-07-03" -> "2026-07-03"
export function isoDate(value) {
  const s = String(value ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  const month = m && MONTHS.indexOf(m[1].toLowerCase());
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}` : undefined;
}

function list(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value ?? "").replace(/^```json\s*|\s*```$/g, ""));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function docType(extract) {
  const t = String(extract?.document_type ?? "").toLowerCase();
  if (t.includes("stub")) return "stubs";
  if (t.includes("bank")) return "bank";
  if (t.includes("explanation")) return "explanation";
  if (t.includes("declaration")) return "declaration";
  return "other";
}

const dollars = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cents = (n) => Math.round(n * 100);
const first = (docs, key) => docs.map((d) => d.extract?.[key]).find((v) => v !== undefined && v !== null && String(v).trim() !== "");

export function calculateEligibility(householdFolderId, extractions, incomeLimits) {
  const docs = extractions.map((e) => ({ ...e, type: docType(e.extract) }));
  const declaration = docs.filter((d) => d.type === "declaration");
  const ordered = [...declaration, ...docs.filter((d) => d.type !== "declaration")];
  const statements = docs.filter((d) => d.type === "bank");
  const facts = [];
  const fact = (f) => {
    if (f.value && !facts.some((x) => x.file_id === f.file_id && x.value === f.value && x.context === f.context)) facts.push(f);
  };

  const householdSize = money(first(ordered, "household_size"));
  const amiPct = money(first(ordered, "unit_ami_pct"));
  const result = {
    household: householdFolderId,
    household_folder_id: householdFolderId,
    name: first(ordered, "applicant_name") || null,
    unit: first(ordered, "unit") || null,
    household_size: householdSize ?? null,
    unit_ami_pct: amiPct ?? null,
    income_limit: incomeLimits?.income_limits_by_household_size?.[String(householdSize)]?.[String(amiPct)] ?? null,
    rules_version: `${incomeLimits?.program ?? "MFTE"} limits effective ${incomeLimits?.effective_date ?? "unknown"}`,
  };

  // Bank statements: one month each, keyed by the statement period (or the deposit dates).
  const deposits = [];
  const statementMonths = new Set();
  for (const d of statements) {
    const rows = list(d.extract.bank_deposits).map((row) => ({
      file_id: d.file_id,
      date_printed: String(row.date ?? ""),
      date: isoDate(row.date),
      description: String(row.description ?? ""),
      amount_printed: String(row.amount ?? ""),
      amount: money(row.amount),
    })).filter((row) => row.amount !== undefined);
    deposits.push(...rows);
    const month = isoDate(d.extract.statement_period)?.slice(0, 7) ?? rows.find((r) => r.date)?.date.slice(0, 7) ?? d.file_id;
    statementMonths.add(month);
    fact({ step: "documents", label: "Statement period", value: d.extract.statement_period, file_id: d.file_id });
  }

  // Pay stubs: one PDF can hold many earnings statements.
  const stubs = docs.filter((d) => d.type === "stubs").flatMap((d) => list(d.extract.pay_stubs).map((s) => ({
    ...s,
    file_id: d.file_id,
    date: isoDate(s.pay_date),
    rate: money(s.hourly_rate),
    hours: money(s.hours),
    gross: money(s.gross_pay),
    net: money(s.net_pay),
    ytd: money(s.ytd_gross),
  }))).filter((s) => s.date).sort((a, b) => a.date.localeCompare(b.date));
  const stubMonths = new Set(stubs.map((s) => s.date.slice(0, 7)));

  const missing = [];
  if (statementMonths.size < 3) missing.push(`Only ${statementMonths.size} of the 3 required consecutive monthly bank statements were provided.`);
  if (stubMonths.size < 3) missing.push(`Pay stubs cover only ${stubMonths.size} of the 3 required months.`);
  if (householdSize === undefined || amiPct === undefined) missing.push("Household size or the unit's AMI restriction is missing from the documents.");

  const flags = [];
  const reasons = [];
  const payroll = deposits.filter((d) => PAYROLL.test(d.description));
  const nonPayroll = deposits.filter((d) => !PAYROLL.test(d.description));
  const countable = nonPayroll.filter((d) => !EXCLUDED_DEPOSIT.test(d.description));
  const months = Math.max(statementMonths.size, 1);

  // Wages: hourly x 2080 from the latest stub, checked against what was actually deposited.
  const latest = stubs.at(-1);
  let wages;
  if (latest?.rate !== undefined) {
    wages = latest.rate * HOURS_PER_YEAR;
    reasons.push(`Wages: ${dollars(latest.rate)}/hr x 2,080 hours = ${dollars(wages)} (pay stubs).`);
    fact({ step: "wages", label: "Hourly rate (latest stub)", value: String(latest.hourly_rate), context: "Hourly rate", page: money(latest.page), file_id: latest.file_id });
    fact({ step: "deposits", label: "Net pay on stub", value: String(latest.net_pay ?? ""), context: "Net pay", page: money(latest.page), file_id: latest.file_id });
  }
  const netPays = new Set(stubs.filter((s) => s.net !== undefined).map((s) => cents(s.net)));
  const unmatched = payroll.filter((d) => !netPays.has(cents(d.amount)));
  for (const d of statements) {
    const row = payroll.find((p) => p.file_id === d.file_id);
    if (row) fact({ step: "deposits", label: `Payroll deposit ${row.date_printed}`, value: row.amount_printed, context: row.date_printed, file_id: row.file_id });
  }
  if (unmatched.length && latest?.gross && latest?.net && latest?.hours) {
    const deposit = unmatched[0].amount;
    const impliedRate = Math.round((deposit * latest.gross) / latest.net / latest.hours * 100) / 100;
    flags.push(`Pay stubs show ${dollars(latest.rate)}/hr (net ${dollars(latest.net)} per check), but payroll deposits of ${dollars(deposit)} match ${dollars(impliedRate)}/hr.`);
    if (impliedRate * HOURS_PER_YEAR > (wages ?? 0)) {
      wages = impliedRate * HOURS_PER_YEAR;
      reasons.push(`Using deposited wages: ${dollars(impliedRate)} x 2,080 = ${dollars(wages)}.`);
    }
  } else if (payroll.length && netPays.size) {
    reasons.push("Payroll deposits match the net pay on the stubs.");
  }

  // Year-to-date gross should grow by each check's gross pay.
  for (let i = 1; i < stubs.length; i++) {
    const [prev, cur] = [stubs[i - 1], stubs[i]];
    if ([prev.ytd, cur.ytd, cur.gross].some((v) => v === undefined)) continue;
    const expected = prev.ytd + cur.gross;
    if (Math.abs(cur.ytd - expected) > 1) {
      flags.push(`The ${cur.pay_date} stub shows year-to-date gross of ${dollars(cur.ytd)}, but the previous stub implies ${dollars(expected)}.`);
      fact({ step: "review", label: "Year-to-date gross", value: String(cur.ytd_gross), context: "Year-to-date", page: money(cur.page), file_id: cur.file_id });
    }
  }

  // Other deposits: non-income ones are left out; the rest count, annualized.
  for (const d of nonPayroll) {
    const counted = !EXCLUDED_DEPOSIT.test(d.description);
    fact({ step: "deposits", label: `${d.description}${counted ? "" : " (not income)"}`, value: d.amount_printed, context: d.date_printed, file_id: d.file_id });
  }
  const otherIncome = countable.reduce((sum, d) => sum + d.amount, 0) * (12 / months);
  const bySource = Object.groupBy(countable, (d) => d.description.toLowerCase());
  const declaredNone = /^\s*none\s*$/i.test(String(first(declaration, "non_wage_income_declared") ?? ""));
  for (const rows of Object.values(bySource).filter((rows) => rows.length >= 2)) {
    const note = declaredNone ? " They were not declared." : "";
    (declaredNone ? flags : reasons).push(`Recurring deposits from ${rows[0].description} (${rows.length} x ${dollars(rows[0].amount)}) count as income.${note}`);
  }
  if (nonPayroll.length && !countable.length) reasons.push("Other deposits (refunds, transfers, interest) are not income.");
  const explanation = docs.some((d) => d.type === "explanation");
  if (!explanation && countable.some((d) => d.amount > 500)) flags.push("Deposits over $500 require a Deposit Explanation Form, which is not in the file.");

  const projected = wages === undefined ? null : Math.round((wages + otherIncome) * 100) / 100;
  if (wages === undefined) missing.push("Wage income could not be calculated from the pay stubs.");
  else if (otherIncome) reasons.push(`Other income: ${dollars(otherIncome)} a year from deposits.`);

  for (const q of docs.flatMap((d) => list(d.extract.evidence_quotes).map((e) => ({ ...e, file_id: d.file_id })))) {
    const label = String(q.label ?? "");
    const step = /household|ami|restriction/i.test(label) ? "limit"
      : /hourly|wage|year-to-date|ytd/i.test(label) ? "wages"
        : /net pay/i.test(label) ? "deposits"
          : /statement/i.test(label) ? "documents" : undefined;
    // Unrecognized labels are usually repeats of the deposit rows built above.
    if (step) fact({ step, label, value: String(q.quote ?? ""), file_id: q.file_id });
  }

  let status;
  if (missing.length) status = "MISSING_INFO";
  else if (flags.length) status = "NEEDS_REVIEW";
  else status = projected > result.income_limit ? "NOT_QUALIFIED" : "QUALIFIES";
  if (projected !== null && result.income_limit !== null) {
    reasons.push(`${dollars(projected)} is ${projected > result.income_limit ? "over" : "under"} the ${dollars(result.income_limit)} limit for a ${householdSize}-person household at ${amiPct}% AMI.`);
  }

  const totals = {};
  for (const d of deposits) if (d.date) totals[d.date.slice(0, 7)] = Math.round(((totals[d.date.slice(0, 7)] ?? 0) + d.amount) * 100) / 100;
  return {
    ...result,
    annual_wage_income_from_stubs: latest?.rate === undefined ? null : latest.rate * HOURS_PER_YEAR,
    bank_statement_months_provided: statementMonths.size,
    bank_deposit_totals: totals,
    payroll_deposits_in_bank: Math.round(payroll.reduce((sum, d) => sum + d.amount, 0) * 100) / 100,
    non_payroll_deposits: nonPayroll.map(({ date, description, amount }) => ({ date, description, amount })),
    status,
    projected_annual_income: projected,
    reasons: [...missing, ...flags, ...reasons],
    flags, // the reasons a person must look at; the review screen warns on these
    facts,
  };
}
