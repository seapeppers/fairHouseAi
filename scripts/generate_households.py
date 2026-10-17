"""Generate synthetic tenant files for the FairHouse AI demo.

Every document is fake and watermarked as synthetic. PDFs are drawn as real
text (not images) so the walkthrough can search and highlight exact words.

Usage:
    pip install -r scripts/requirements.txt
    python scripts/generate_households.py

Writes PDFs under data/households/ and data/households/expected_results.json,
the answer key we test the agent against.
"""

import json
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "households"
LIMITS = json.loads((ROOT / "data" / "rules" / "income_limits_mfte_p7_2026.json").read_text())

BUILDING = "Juniper Court Apartments"
BUILDING_ADDRESS = "4500 Example Ave S, Seattle, WA 98118"
BANK = "Puget Community Bank"

# Washington has no state income tax; federal withholding is simplified to a flat rate.
FED_RATE, SS_RATE, MEDICARE_RATE = 0.10, 0.062, 0.0145

# Biweekly Friday pay dates; Jan 2, 2026 is period 1, so Jul 3 is period 14.
FIRST_PAY_DATE = date(2026, 1, 2)
PAY_DATES = [date(2026, 7, 3) + timedelta(weeks=2 * i) for i in range(7)]  # Jul 3 .. Sep 25
MONTHS = [(2026, 7, "July"), (2026, 8, "August"), (2026, 9, "September")]
MONTH_END = {7: 31, 8: 31, 9: 30}


def money(x: float) -> str:
    return f"${x:,.2f}"


def period_number(d: date) -> int:
    return (d - FIRST_PAY_DATE).days // 14 + 1


def net_of(gross: float) -> float:
    return round(gross * (1 - FED_RATE - SS_RATE - MEDICARE_RATE), 2)


@dataclass
class Deposit:
    day: date
    description: str
    amount: float


@dataclass
class Household:
    folder: str
    name: str
    unit: str
    unit_ami_pct: int
    size: int
    employer: str
    job_title: str
    stub_rate: float          # hourly rate printed on the pay stubs
    true_rate: float          # rate actually deposited by payroll (differs only if stubs are altered)
    hours_per_week: int
    account_last4: str
    declared_other_income: str
    extra_deposits: list = field(default_factory=list)
    bank_months: tuple = (7, 8, 9)
    ytd_override: dict = field(default_factory=dict)   # pay date -> printed YTD gross
    demographics: dict = field(default_factory=dict)


def watermark(c: canvas.Canvas) -> None:
    c.saveState()
    c.setFont("Helvetica-Bold", 9)
    c.setFillGray(0.45)
    c.drawString(40, 20, "SYNTHETIC DEMO DATA - NOT A REAL PERSON OR DOCUMENT - FairHouse AI hackathon")
    c.restoreState()


def write_lines(c: canvas.Canvas, x: int, y: int, lines, size=10, leading=15) -> int:
    c.setFont("Helvetica", size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def make_paystubs(h: Household, path: Path) -> None:
    c = canvas.Canvas(str(path), pagesize=letter)
    hours = h.hours_per_week * 2
    for d in PAY_DATES:
        gross = round(h.stub_rate * hours, 2)
        fed, ss, med = round(gross * FED_RATE, 2), round(gross * SS_RATE, 2), round(gross * MEDICARE_RATE, 2)
        net = round(gross - fed - ss - med, 2)
        ytd = h.ytd_override.get(d, round(gross * period_number(d), 2))
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, 740, f"{h.employer} - Earnings Statement")
        write_lines(c, 40, 715, [
            f"Employee: {h.name}",
            f"Position: {h.job_title}",
            f"Pay frequency: Bi-weekly",
            f"Pay period ending: {(d - timedelta(days=5)).strftime('%B %d, %Y')}",
            f"Pay date: {d.strftime('%B %d, %Y')}",
        ])
        y = write_lines(c, 40, 620, [
            f"Hourly rate: {money(h.stub_rate)}",
            f"Regular hours: {hours:.2f}",
            f"Gross pay: {money(gross)}",
            f"Federal income tax: {money(fed)}",
            f"Social Security: {money(ss)}",
            f"Medicare: {money(med)}",
            f"Net pay: {money(net)}",
        ], size=11, leading=18)
        write_lines(c, 40, y - 10, [f"Year-to-date gross: {money(ytd)}"], size=11)
        watermark(c)
        c.showPage()
    c.save()


def bank_deposits(h: Household, month: int) -> list:
    payroll_net = net_of(h.true_rate * h.hours_per_week * 2)
    deps = [Deposit(d, f"{h.employer.upper()} PAYROLL DIRECT DEP", payroll_net) for d in PAY_DATES if d.month == month]
    deps += [dep for dep in h.extra_deposits if dep.day.month == month]
    return sorted(deps, key=lambda dep: dep.day)


def make_bank_statement(h: Household, year: int, month: int, label: str, path: Path) -> float:
    deps = bank_deposits(h, month)
    total = round(sum(dep.amount for dep in deps), 2)
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, 740, f"{BANK} - Monthly Statement")
    write_lines(c, 40, 715, [
        f"Account holder: {h.name}",
        f"Checking account ending in {h.account_last4}",
        f"Statement period: {label} 1, {year} - {label} {MONTH_END[month]}, {year}",
        f"Total deposits this period: {money(total)}",
    ])
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, 630, "Deposits")
    y = 610
    c.setFont("Helvetica", 10)
    for dep in deps:
        c.drawString(40, y, dep.day.strftime("%m/%d/%Y"))
        c.drawString(130, y, dep.description)
        c.drawRightString(560, y, money(dep.amount))
        y -= 16
    write_lines(c, 40, y - 20, ["Withdrawals and card purchases are omitted from this demo statement."], size=9)
    watermark(c)
    c.save()
    return total


def make_income_declaration(h: Household, path: Path) -> None:
    annual_declared = h.stub_rate * h.hours_per_week * 52
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, 740, "Income Declaration Form (demo replica of Seattle Office of Housing form)")
    write_lines(c, 40, 710, [
        f"Property: {BUILDING}, {BUILDING_ADDRESS}",
        f"Unit: {h.unit}    Unit income restriction: {h.unit_ami_pct}% AMI (MFTE Program 7)",
        f"Household size: {h.size}",
        "",
        "Section 1 - Wage income",
        f"Household member: {h.name}",
        f"Employer: {h.employer}",
        f"Hourly wage: {money(h.stub_rate)}    Hours per week: {h.hours_per_week}",
        f"Gross annual wage income: {money(annual_declared)}",
        "",
        "Section 2 - Non-wage income (benefits, support, gifts, assets)",
        f"Declared: {h.declared_other_income}",
        "",
        "I certify that the information above is true and complete.",
        f"Signature: {h.name}    Date: October 1, 2026",
    ], size=11, leading=18)
    watermark(c)
    c.save()


def make_demographic_form(h: Household, path: Path) -> None:
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, 740, "Resident Demographic Form (demo replica)")
    lines = [f"Resident: {h.name}", ""] + [f"{k}: {v}" for k, v in h.demographics.items()]
    lines += ["", "Used for program reporting only. FairHouse AI never reads this form",
              "when making eligibility decisions."]
    write_lines(c, 40, 710, lines, size=11, leading=18)
    watermark(c)
    c.save()


def expected_result(h: Household, bank_totals: dict) -> dict:
    limit = LIMITS["income_limits_by_household_size"][str(h.size)][str(h.unit_ami_pct)]
    stub_annual = round(h.stub_rate * 2080 * h.hours_per_week / 40, 2)
    payroll_net = net_of(h.true_rate * h.hours_per_week * 2)
    payroll_in_bank = sum(payroll_net for d in PAY_DATES if d.month in h.bank_months)
    other = [dep for dep in h.extra_deposits if dep.day.month in h.bank_months]
    return {
        "household": h.folder,
        "name": h.name,
        "unit": h.unit,
        "household_size": h.size,
        "unit_ami_pct": h.unit_ami_pct,
        "income_limit": limit,
        "annual_wage_income_from_stubs": stub_annual,
        "bank_statement_months_provided": len(h.bank_months),
        "bank_deposit_totals": bank_totals,
        "payroll_deposits_in_bank": round(payroll_in_bank, 2),
        "non_payroll_deposits": [{"date": d.day.isoformat(), "description": d.description, "amount": d.amount} for d in other],
    }


HOUSEHOLDS = [
    Household(
        folder="A_qualifies",
        name="Maria Lopez",
        unit="2A",
        unit_ami_pct=60,
        size=1,
        employer="Evergreen Roasters LLC",
        job_title="Shift Supervisor",
        stub_rate=24.00,
        true_rate=24.00,
        hours_per_week=40,
        account_last4="4417",
        declared_other_income="None",
        extra_deposits=[
            Deposit(date(2026, 7, 14), "ONLINE RETAILER REFUND", 42.10),
            Deposit(date(2026, 8, 9), "TRANSFER FROM SAVINGS x2210", 200.00),
            Deposit(date(2026, 9, 30), "INTEREST PAID", 0.84),
        ],
        demographics={"Race/ethnicity": "Hispanic or Latino", "Primary language": "Spanish", "Disability": "No"},
    ),
    Household(
        folder="B_missing_docs",
        name="Daniel Kim",
        unit="3C",
        unit_ami_pct=70,
        size=1,
        employer="Northwind Logistics Inc",
        job_title="Dispatcher",
        stub_rate=31.00,
        true_rate=31.00,
        hours_per_week=40,
        account_last4="8830",
        declared_other_income="None",
        bank_months=(7, 8),  # September statement was never provided
        demographics={"Race/ethnicity": "Asian", "Primary language": "English", "Disability": "No"},
    ),
    Household(
        folder="C_needs_review",
        name="Tyler Brooks",
        unit="5F",
        unit_ami_pct=60,
        size=1,
        employer="Cascade Freight Services",
        job_title="Warehouse Associate",
        stub_rate=20.00,   # what the stubs claim
        true_rate=28.00,   # what payroll actually deposits: the stubs appear altered
        hours_per_week=40,
        account_last4="1952",
        declared_other_income="None",
        extra_deposits=[
            Deposit(date(2026, 7, 1), "ZELLE FROM R BROOKS", 1500.00),
            Deposit(date(2026, 8, 1), "ZELLE FROM R BROOKS", 1500.00),
            Deposit(date(2026, 9, 1), "ZELLE FROM R BROOKS", 1500.00),
        ],
        # Sep 25 stub prints a YTD that jumps far beyond one $1,600 pay period.
        ytd_override={date(2026, 9, 25): 44800.00},
        demographics={"Race/ethnicity": "White", "Primary language": "English", "Disability": "No"},
    ),
]

# What a correct reviewer should conclude. Numbers follow data/rules/rules.md section 4.
VERDICTS = {
    "A_qualifies": {
        "status": "QUALIFIES",
        "projected_annual_income": 49920.00,
        "reasons": [
            "Wages: $24.00/hr x 2,080 hours = $49,920.00 (pay stubs).",
            "Bank deposits: all payroll deposits match the stubs; the refund, savings transfer and interest are not income.",
            "$49,920.00 is under the $69,060 limit for a 1-person household at 60% AMI.",
        ],
    },
    "B_missing_docs": {
        "status": "MISSING_INFO",
        "projected_annual_income": 64480.00,
        "reasons": [
            "Only 2 of the 3 required consecutive monthly bank statements were provided (September is missing).",
            "Provisional wages: $31.00/hr x 2,080 hours = $64,480.00, under the $80,570 limit at 70% AMI.",
            "Cannot certify until the September bank statement is uploaded.",
        ],
    },
    "C_needs_review": {
        "status": "NEEDS_REVIEW",
        "projected_annual_income": 76240.00,
        "reasons": [
            "Pay stubs show $20.00/hr (net $1,317.60 per check), but every payroll deposit is $1,844.64, which matches $28.00/hr. The stubs appear altered.",
            "The September 25 stub shows year-to-date gross of $44,800.00; the September 11 stub implies about $30,400. One $1,600 check cannot explain the jump.",
            "Recurring monthly Zelle deposits of $1,500 from the same person (R Brooks) count as income but were not declared.",
            "Using deposited wages ($28.00 x 2,080 = $58,240) plus recurring support ($1,500 x 3 x 4 = $18,000), projected income is $76,240, over the $69,060 limit.",
            "Deposits over $500 require a Deposit Explanation Form, which is not in the file.",
        ],
    },
}


def main() -> None:
    results = []
    for h in HOUSEHOLDS:
        folder = OUT / h.folder
        folder.mkdir(parents=True, exist_ok=True)
        make_income_declaration(h, folder / "income_declaration.pdf")
        make_paystubs(h, folder / "paystubs_jul-sep_2026.pdf")
        totals = {}
        for year, month, label in MONTHS:
            if month in h.bank_months:
                totals[label] = make_bank_statement(h, year, month, label, folder / f"bank_statement_{year}-{month:02d}.pdf")
        make_demographic_form(h, folder / "resident_demographic_form.pdf")
        results.append({**expected_result(h, totals), **VERDICTS[h.folder]})
    (OUT / "expected_results.json").write_text(json.dumps(results, indent=2) + "\n")
    print(f"Wrote {len(HOUSEHOLDS)} households to {OUT}")


if __name__ == "__main__":
    main()
