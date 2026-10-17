// Mock check results for the three synthetic demo households.
// Every quote is copied exactly from the PDFs in data/households/ so the
// viewer can highlight it. Matches data/households/expected_results.json.
import type { CheckResult, DocumentRef, HouseholdSummary } from '../types'

const BUILDING = 'Juniper Court Apartments'
const RULES = 'Seattle MILU Compliance Manual (Sep 8, 2026); MFTE P7 limits (May 15, 2026)'
const EXCLUDED = [{ file_name: 'resident_demographic_form.pdf', reason: 'Never used for eligibility decisions' }]

function doc(household: string, file_name: string, label: string): DocumentRef {
  return { file_id: `${household}/${file_name}`, file_name, label }
}

function docsFor(household: string, months: string[]): DocumentRef[] {
  return [
    doc(household, 'paystubs_jul-sep_2026.pdf', 'Pay stubs'),
    ...months.map((m) => doc(household, `bank_statement_2026-${m}.pdf`, `Bank · ${monthName(m)}`)),
    doc(household, 'income_declaration.pdf', 'Declaration'),
  ]
}

function monthName(m: string) {
  return { '07': 'Jul', '08': 'Aug', '09': 'Sep' }[m] ?? m
}

function ev(household: string, file_name: string, page: number, quote: string) {
  return { file_id: `${household}/${file_name}`, file_name, page, quote }
}

const A = 'A_qualifies'
const B = 'B_missing_docs'
const C = 'C_needs_review'

export const MOCK_RESULTS: Record<string, CheckResult> = {
  [A]: {
    household_id: A,
    name: 'Maria Lopez',
    building: BUILDING,
    unit: '2A',
    household_size: 1,
    unit_ami_pct: 60,
    income_limit: 69060,
    projected_annual_income: 49920,
    status: 'QUALIFIES',
    summary: 'Wages match the bank deposits, and income is under the 60% AMI limit.',
    documents: docsFor(A, ['07', '08', '09']),
    steps: [
      {
        id: 'documents',
        title: 'Required documents',
        headline: 'All required documents are on file',
        detail: '3 consecutive bank statements, 7 pay stubs and the income declaration are present.',
        result: 'pass',
        evidence: [ev(A, 'bank_statement_2026-09.pdf', 1, 'Statement period: September 1, 2026 - September 30, 2026')],
      },
      {
        id: 'wages',
        title: 'Wage income',
        headline: 'Pay stubs match the payroll deposits',
        detail: '$24.00/hr × 2,080 hours = $49,920. Each payroll deposit of $1,581.12 matches the net pay on the stubs.',
        amount: 49920,
        result: 'pass',
        evidence: [
          ev(A, 'paystubs_jul-sep_2026.pdf', 1, 'Hourly rate: $24.00'),
          ev(A, 'bank_statement_2026-07.pdf', 1, '07/03/2026 EVERGREEN ROASTERS LLC PAYROLL DIRECT DEP $1,581.12'),
        ],
      },
      {
        id: 'ytd',
        title: 'Year-to-date totals',
        headline: 'Year-to-date totals add up',
        detail: 'Year-to-date gross rises by $1,920 each pay period, ending at $38,400 on Sep 25.',
        result: 'pass',
        evidence: [ev(A, 'paystubs_jul-sep_2026.pdf', 7, 'Year-to-date gross: $38,400.00')],
      },
      {
        id: 'deposits',
        title: 'Other deposits',
        headline: 'Other deposits are not income',
        detail: 'A refund, a transfer from savings and bank interest. None of these count as income.',
        result: 'pass',
        evidence: [
          ev(A, 'bank_statement_2026-07.pdf', 1, '07/14/2026 ONLINE RETAILER REFUND $42.10'),
          ev(A, 'bank_statement_2026-08.pdf', 1, '08/09/2026 TRANSFER FROM SAVINGS x2210 $200.00'),
        ],
      },
      {
        id: 'total',
        title: 'Total vs. limit',
        headline: 'Income is under the limit',
        detail: '$49,920 is under the $69,060 limit for a 1-person household at 60% AMI.',
        amount: 49920,
        result: 'pass',
        result_label: 'Under limit',
        evidence: [ev(A, 'income_declaration.pdf', 1, 'Unit income restriction: 60% AMI (MFTE Program 7)')],
      },
    ],
    excluded_documents: EXCLUDED,
    rules_version: RULES,
  },

  [B]: {
    household_id: B,
    name: 'Daniel Kim',
    building: BUILDING,
    unit: '3C',
    household_size: 1,
    unit_ami_pct: 70,
    income_limit: 80570,
    projected_annual_income: 64480,
    status: 'MISSING_INFO',
    summary: 'The September 2026 bank statement is missing. Income looks under the limit so far.',
    documents: docsFor(B, ['07', '08']),
    steps: [
      {
        id: 'documents',
        title: 'Required documents',
        headline: 'September bank statement is missing',
        detail: 'Only July and August bank statements were provided. Three consecutive months are required.',
        result: 'fail',
        result_label: 'Missing',
        evidence: [ev(B, 'bank_statement_2026-08.pdf', 1, 'Statement period: August 1, 2026 - August 31, 2026')],
      },
      {
        id: 'wages',
        title: 'Wage income',
        headline: 'Pay stubs match the payroll deposits',
        detail: '$31.00/hr × 2,080 hours = $64,480. Each payroll deposit of $2,042.28 matches the stubs.',
        amount: 64480,
        result: 'pass',
        evidence: [
          ev(B, 'paystubs_jul-sep_2026.pdf', 1, 'Hourly rate: $31.00'),
          ev(B, 'bank_statement_2026-08.pdf', 1, '08/14/2026 NORTHWIND LOGISTICS INC PAYROLL DIRECT DEP $2,042.28'),
        ],
      },
      {
        id: 'ytd',
        title: 'Year-to-date totals',
        headline: 'Year-to-date totals add up',
        detail: 'Year-to-date gross rises by $2,480 each pay period, ending at $49,600 on Sep 25.',
        result: 'pass',
        evidence: [ev(B, 'paystubs_jul-sep_2026.pdf', 7, 'Year-to-date gross: $49,600.00')],
      },
      {
        id: 'deposits',
        title: 'Other deposits',
        headline: 'No other deposits in July or August',
        detail: 'Only payroll deposits appear on the two statements provided.',
        result: 'pass',
        evidence: [ev(B, 'bank_statement_2026-07.pdf', 1, 'Total deposits this period: $6,126.84')],
      },
      {
        id: 'total',
        title: 'Total vs. limit',
        headline: 'Under the limit, but not final',
        detail: '$64,480 is under the $80,570 limit at 70% AMI. This can’t be certified until September is in.',
        amount: 64480,
        result: 'warn',
        result_label: 'Provisional',
        evidence: [ev(B, 'income_declaration.pdf', 1, 'Unit income restriction: 70% AMI (MFTE Program 7)')],
      },
    ],
    excluded_documents: EXCLUDED,
    rules_version: RULES,
  },

  [C]: {
    household_id: C,
    name: 'Tyler Brooks',
    building: BUILDING,
    unit: '5F',
    household_size: 1,
    unit_ami_pct: 60,
    income_limit: 69060,
    projected_annual_income: 76240,
    status: 'NEEDS_REVIEW',
    summary: 'The pay stub and the bank don’t agree, and a monthly deposit isn’t on the declaration.',
    documents: docsFor(C, ['07', '08', '09']),
    steps: [
      {
        id: 'documents',
        title: 'Required documents',
        headline: 'All required documents are on file',
        detail: '3 consecutive bank statements, 7 pay stubs and the income declaration are present.',
        result: 'pass',
        evidence: [ev(C, 'bank_statement_2026-09.pdf', 1, 'Statement period: September 1, 2026 - September 30, 2026')],
      },
      {
        id: 'wages',
        title: 'Wage income',
        headline: 'Pay stub and bank deposits don’t match',
        detail: 'Pay stubs list $20.00/hr. Each payroll deposit is $1,844.64, which matches $28.00/hr.',
        amount: 58240,
        result: 'warn',
        evidence: [
          ev(C, 'paystubs_jul-sep_2026.pdf', 1, 'Hourly rate: $20.00'),
          ev(C, 'bank_statement_2026-07.pdf', 1, '07/03/2026 CASCADE FREIGHT SERVICES PAYROLL DIRECT DEP $1,844.64'),
        ],
      },
      {
        id: 'ytd',
        title: 'Year-to-date totals',
        headline: 'Year-to-date jumps by $14,400 in one check',
        detail: 'The Sep 11 stub shows $30,400 year-to-date. Two weeks later it shows $44,800. One $1,600 check can’t explain that.',
        result: 'warn',
        evidence: [
          ev(C, 'paystubs_jul-sep_2026.pdf', 6, 'Year-to-date gross: $30,400.00'),
          ev(C, 'paystubs_jul-sep_2026.pdf', 7, 'Year-to-date gross: $44,800.00'),
        ],
      },
      {
        id: 'deposits',
        title: 'Other deposits',
        headline: 'A $1,500 monthly deposit isn’t declared',
        detail: '“ZELLE FROM R BROOKS” arrives every month. Recurring support counts as income, and deposits over $500 need a Deposit Explanation Form, which isn’t in the file.',
        amount: 18000,
        result: 'warn',
        evidence: [
          ev(C, 'bank_statement_2026-07.pdf', 1, '07/01/2026 ZELLE FROM R BROOKS $1,500.00'),
          ev(C, 'income_declaration.pdf', 1, 'Declared: None'),
        ],
      },
      {
        id: 'total',
        title: 'Total vs. limit',
        headline: 'Projected income is over the limit',
        detail: '$58,240 in deposited wages + $18,000 in recurring deposits = $76,240, above the $69,060 limit.',
        amount: 76240,
        result: 'fail',
        result_label: 'Over limit',
        evidence: [ev(C, 'income_declaration.pdf', 1, 'Unit income restriction: 60% AMI (MFTE Program 7)')],
      },
    ],
    excluded_documents: EXCLUDED,
    rules_version: RULES,
  },
}

export const MOCK_HOUSEHOLDS: HouseholdSummary[] = [C, B, A].map((id) => {
  const r = MOCK_RESULTS[id]
  return {
    household_id: id,
    name: r.name,
    building: r.building,
    unit: r.unit,
    status: r.status,
    summary: r.summary,
    projected_annual_income: r.projected_annual_income,
    income_limit: r.income_limit,
    missing_documents: id === B ? ['Bank statement, September 2026'] : [],
  }
})
