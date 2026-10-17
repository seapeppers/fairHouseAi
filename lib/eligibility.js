const EXCLUDED_DEPOSIT = /refund|transfer|interest|reimbursement|card reward|tax refund|investment withdrawal/i;

function asNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function text(value) {
  return typeof value === "string" ? value : "";
}

function collect(extractions, key) {
  return extractions.map(({ extract }) => extract?.[key]).filter((value) => value !== undefined && value !== null && value !== "");
}

function first(extractions, key) {
  return collect(extractions, key)[0];
}

function deposits(extractions) {
  return collect(extractions, "bank_deposits").flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }).map((deposit) => ({
    ...deposit,
    amount: asNumber(deposit.amount),
    description: text(deposit.description),
  })).filter((deposit) => deposit.amount !== undefined);
}

function wageIncome(extractions) {
  const hourlyRate = asNumber(first(extractions, "hourly_rate"));
  const annualIncome = asNumber(first(extractions, "annual_wage_income"));
  return annualIncome ?? (hourlyRate === undefined ? undefined : hourlyRate * 2080);
}

function missingDocuments(extractions) {
  const types = collect(extractions, "document_type").map((value) => text(value).toLowerCase());
  const bankStatements = types.filter((value) => value.includes("bank statement")).length;
  const payStubs = types.filter((value) => value.includes("pay stub")).length;
  const missing = [];
  if (bankStatements < 3) missing.push(`Only ${bankStatements} of the 3 required consecutive monthly bank statements were provided.`);
  if (payStubs < 3) missing.push(`Only ${payStubs} of the 3 required months of pay stubs were provided.`);
  return { bankStatements, missing };
}

export function defaultResult(submissionId) {
  return {
    household: submissionId,
    name: null,
    unit: null,
    household_size: null,
    unit_ami_pct: null,
    income_limit: null,
    annual_wage_income_from_stubs: null,
    bank_statement_months_provided: 0,
    bank_deposit_totals: {},
    payroll_deposits_in_bank: 0,
    non_payroll_deposits: [],
    status: "MISSING_INFO",
    projected_annual_income: null,
    reasons: ["Awaiting eligible submission documents."],
  };
}

export function calculateEligibility(submissionId, extractions, incomeLimits) {
  const result = defaultResult(submissionId);
  result.name = first(extractions, "applicant_name") || null;
  result.unit = first(extractions, "unit") || null;
  result.household_size = asNumber(first(extractions, "household_size")) ?? null;
  result.unit_ami_pct = asNumber(first(extractions, "unit_ami_pct")) ?? null;
  const { bankStatements, missing } = missingDocuments(extractions);
  result.bank_statement_months_provided = bankStatements;
  const wages = wageIncome(extractions);
  result.annual_wage_income_from_stubs = wages ?? null;

  const allDeposits = deposits(extractions);
  const payrollDeposits = allDeposits.filter((deposit) => /payroll|direct dep/i.test(deposit.description));
  const nonPayroll = allDeposits.filter((deposit) => !/payroll|direct dep/i.test(deposit.description));
  result.payroll_deposits_in_bank = payrollDeposits.reduce((sum, deposit) => sum + deposit.amount, 0);
  result.non_payroll_deposits = nonPayroll.map(({ date, description, amount }) => ({ date, description, amount }));

  const recurringIncome = nonPayroll.filter((deposit) => !EXCLUDED_DEPOSIT.test(deposit.description));
  const annualizedDeposits = recurringIncome.reduce((sum, deposit) => sum + deposit.amount, 0) * 4;
  result.projected_annual_income = wages === undefined ? null : wages + annualizedDeposits;
  if (result.household_size !== null && result.unit_ami_pct !== null) {
    result.income_limit = incomeLimits?.income_limits_by_household_size?.[String(result.household_size)]?.[String(result.unit_ami_pct)] ?? null;
  }

  if (!result.name) missing.push("Applicant name is missing from the submitted documents.");
  if (!result.unit) missing.push("Unit number is missing from the submitted documents.");
  if (result.household_size === null) missing.push("Household size is missing from the submitted documents.");
  if (result.unit_ami_pct === null) missing.push("Unit AMI percentage is missing from the submitted documents.");
  if (wages === undefined) missing.push("Annual wage income could not be calculated from the submitted pay stubs.");
  if (result.income_limit === null) missing.push("Income limit could not be determined from household size and unit AMI percentage.");

  const recurringSources = new Set(recurringIncome.map((deposit) => deposit.description.toLowerCase()));
  const depositExplanationPresent = collect(extractions, "deposit_explanation_form_present").some((value) => value === true || value === "true");
  const unexplainedLargeDeposits = depositExplanationPresent ? [] : nonPayroll.filter((deposit) => deposit.amount > 500);
  const reasons = [...missing];
  if (wages !== undefined) reasons.push(`Annualized wage income is $${wages.toFixed(2)} from source documents.`);
  if (recurringSources.size) reasons.push("Recurring non-payroll deposits are included as annualized income.");
  if (unexplainedLargeDeposits.length) reasons.push("Deposits over $500 require a Deposit Explanation Form.");

  if (missing.length) result.status = "MISSING_INFO";
  else if (unexplainedLargeDeposits.length || recurringSources.size) result.status = "NEEDS_REVIEW";
  else if (result.projected_annual_income <= result.income_limit) result.status = "QUALIFIES";
  else result.status = "NEEDS_REVIEW";
  if (!missing.length && result.status === "QUALIFIES") reasons.push(`Projected annual income of $${result.projected_annual_income.toFixed(2)} is within the $${result.income_limit.toFixed(2)} income limit.`);
  if (!missing.length && result.status === "NEEDS_REVIEW" && result.projected_annual_income > result.income_limit) reasons.push(`Projected annual income of $${result.projected_annual_income.toFixed(2)} exceeds the $${result.income_limit.toFixed(2)} income limit.`);
  result.reasons = reasons;
  return result;
}
