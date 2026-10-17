# FairHouse AI

AI that checks affordable-housing tenant files for the **Seattle Office of Housing**, with the proof highlighted, so every file can be reviewed every year under the same rules.

Built at the Agentic Enterprise AI Hackathon with Box + AWS (Seattle, Oct 2026).

## The problem
Seattle's MFTE program has about 6,600 income-restricted apartments in about 286 buildings. Property managers check each tenant's income, but after a building's first year the city typically reviews files only **every 3 years**, and only a **sample of 20% (min. 10 files)** (Compliance Manual, p.14-15).

## How it works
1. **Read**: tenant documents land in a Box folder; text and word positions are extracted (AWS Textract or Box AI).
2. **Extract**: Claude on AWS Bedrock pulls out wages, deposits, and benefits, each with its exact quote and page.
3. **Calculate**: plain code applies the city's formula (`data/rules/rules.md`, section 4). No AI in the math.
4. **Validate**: Claude checks for missing documents, mismatches, and suspicious items.
5. **Explain**: the analyst walks through each step with the source document highlighted, approves with Box Sign, and the audit record is saved to Box.

The Resident Demographic Form is in each file (the city requires it) but is **never** used for decisions.

## Repo layout
```
data/rules/        Seattle's rules (plain English + page refs), 2026 income limits, sources
data/households/   3 synthetic tenant files + expected_results.json (the answer key)
scripts/           generate_households.py regenerates the synthetic PDFs
docs/pitch.md      problem / solution / demo write-up
```

## Demo households (all synthetic)
| Folder | Expected result | Why |
|---|---|---|
| `A_qualifies` | Qualifies | $24/hr = $49,920, under the $69,060 limit (1 person, 60% AMI) |
| `B_missing_docs` | Missing info | Only 2 of 3 required bank statements |
| `C_needs_review` | Needs review | Stubs say $20/hr but payroll deposits match $28/hr; undeclared recurring $1,500/month; over the limit |

Regenerate: `pip install -r scripts/requirements.txt && python scripts/generate_households.py`
