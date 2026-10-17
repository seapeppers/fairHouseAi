# FairHouse AI: pitch notes

## Situation
Seattle's MFTE program gives apartment buildings a tax break if they rent 20-25% of units at lower rents to people under an income limit (about 6,600 apartments in about 286 buildings). Property managers verify each tenant's income; the Seattle Office of Housing oversees them.

## Problem
After the first year, the city typically reviews a building's tenant files only every 3 years, and only a sample (20% or 10 files). Mistakes and fraud can go unnoticed for years, and applicants can't see why they were approved or rejected.

## Solution
Property managers send each tenant file into a city-controlled Box folder. FairHouse AI checks it against the city's real rules and income limits, sorts it (qualifies, doesn't qualify, missing info, needs review), and shows the analyst every step with the source document highlighted. The analyst decides and signs with Box Sign; the audit record is saved in Box.

## Why it matters
Every file, every year, the same rules for everyone. Note: 90% AMI for 1 person is $103,590 in 2026, so a six-figure earner can qualify legitimately; showing the reasoning is what separates a valid case from a mistake.

## Trust
- Data stays in the city's Box; the AI runs in AWS; no copies kept by us.
- Every number links to the exact words in the original document.
- A human makes every final decision.
- The demographic form is never used for decisions.
- Tested against an answer key (`data/households/expected_results.json`).

## Demo
A (qualifies) -> walkthrough -> Box Sign. B (missing September bank statement) -> Box task. C (stubs show $20/hr, deposits show $28/hr, undeclared $1,500/month) -> flagged for review.
