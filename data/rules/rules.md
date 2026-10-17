# FairHouse AI: income eligibility rules (Seattle MFTE)

Source: Seattle Office of Housing, "Compliance Manual for MILU Regulatory Agreements"
(published Dec 31, 2025, updated Sep 8, 2026). Page numbers below are the manual's own.
https://www.seattle.gov/documents/Departments/Housing/PropertyManagers/MFTECompliance/Compliance_Manual_MILU_Agreements.pdf

## 1. What counts as income (p.5)
- Gross annual income (before taxes) of ALL household members.
- Earned: wages, salaries, overtime, commissions, fees, tips, bonuses, self-employment (use NET for self-employment). Hiring bonuses may be excluded (p.19).
- Unearned: retirement, Social Security (gross, before Medicare), pensions, annuities, unemployment, public assistance (DSHS), alimony, child support, military Base Pay + BAH (p.20).
- NOT income: SNAP/food assistance, HEN, housing subsidies, one-time lump sums (inheritance, lottery, settlements), sporadic gifts from different sources, BAS/combat pay (p.20-21).
- Recurring monthly gifts from the same source ARE income (p.21).
- Guarantors are not counted (p.5).

## 2. Required documents per household file (p.14)
a. Income Declaration Form (all adults, signed)
b. Tenant Income Certification (TIC), signed by household and property
c. Income Calculation Worksheet
d. Income documentation / verification
e. Demographic Form  <-- FairHouse AI must NOT use this for decisions
f. Lease and Lease Rider
g. Written communication with the household

## 3. Verification rules (p.6, p.19-22)
- Every adult: 3 consecutive months of bank statements.
- Wages, either: 3+ months of current, consecutive pay stubs, OR an offer letter, OR a W-2 / prior tax return; or third-party verification (Employment Verification form, The Work Number).
- Self-employed / 1099: prior-year tax return + Schedule C.
- Social Security: benefit letter no older than last COLA. Pensions: statement no older than 12 months.
- Certification must be within 120 days before lease start; lease must start within 5 days after TIC signed (p.5-6).
- Self-certification: max 10% of restricted units per year; not allowed for MHA units (p.6-7).

## 4. Income calculation (p.22-23)  <-- implement in PLAIN CODE
Projected income = annualized source-document income
                 + (annualized bank deposits - deposits already counted)
Annualize: hourly x 2080 (full-time) or x anticipated hours (part-time); weekly x 52; bi-weekly x 26; semi-monthly x 24; monthly x 12.
Bank deposits: sum 3 months of deposits -> remove duplicates of verified income -> x 4.
Exclude non-income deposits: vendor refunds, transfers between own accounts, tax refunds, reimbursements, interest, card rewards, sporadic investment withdrawals.
If over-income: re-review deposits; deposits over $500 need a Deposit Explanation Form.

## 5. Eligibility (p.6)
- Eligible if gross annual household income <= income limit for the unit's AMI % and household size (see income_limits_mfte_p7_2026.json).
- If not eligible: written notice to applicant with the final income calculation; explain if asked.

## 6. Annual recertification (p.7-9)
- MFTE: stays eligible if income <= 1.5x current limit AND <= 115% AMI.
- Years 1-2 after move-in: self-certification allowed. Every 3rd year: full documentation.
- Over the cap: unit converts to market rate; a replacement unit must be restricted. No eviction for being over income.

## 7. How the city audits today (p.14-15)  <-- the pain we solve
- Initial review: all files, within 6 months of compliance period start.
- After that: typically every 3 YEARS, sampling a minimum of 20% of files or 10 files (whichever is higher).
- Annual Property Certification due Jan 31 each year.
- Missing documents: 2 weeks to respond, then a second request, then a Summary of Non-Compliance. For MFTE, the city can remove the property's tax exemption.
