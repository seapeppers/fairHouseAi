# FairHouse AI Box webhook Lambda

Lives in `webhook/`; reads the rules from `../data/rules` (bundled into the zip by `npm run package`).

## Supported trigger

The Lambda accepts only a Box `FILE.UPLOADED` webhook delivered through API Gateway Lambda proxy integration. It verifies `box-signature` using `BOX_WEBHOOK_PRIMARY_KEY` and the raw request body plus `box-delivery-timestamp`. Configure the Box webhook to watch the household folder hierarchy and deliver to the API Gateway URL.

## Processing contract

1. The uploaded file's parent folder is the household (one folder per household, e.g. `Unit 2A - Maria Lopez`). Uploads of our own `*_check_result.json` files, or into the results folder, are ignored so the webhook never triggers itself.
2. Every file in the household folder is read except resident demographic forms, which are never sent to extraction or decisioning.
3. Box AI structured extraction (model `BOX_AI_MODEL`, default `aws__claude_4_5_sonnet`) pulls each value exactly as printed: pay stubs (one PDF may hold many), bank deposits, statement periods, household size, AMI restriction, and quotes of the lines that prove them.
4. Plain code (`lib/eligibility.js`, rules.md section 4) does the math and the checks: 3 months of statements and stubs, stub net pay vs. payroll deposits (wages re-derived from deposits when they disagree), year-to-date growth, recurring and undeclared deposits, deposits over $500 without an explanation form, income vs. limit.
5. Claude on Bedrock (`BEDROCK_MODEL_ID`) adds judgment calls the code does not cover; medium and high findings send a qualifying household to review. If that call fails, the household goes to review rather than passing.
6. One file per household, `<household folder id>_check_result.json`, is written (or versioned) in `BOX_RESULTS_FOLDER_ID`. Its `facts` list carries each cited value as printed with its file id; the backend finds it in the PDF to highlight it.

Status: MISSING_INFO if documents are missing, else NEEDS_REVIEW if any check or the model flags something, else NOT_QUALIFIED if over the limit, else QUALIFIES.

## Running households by hand

The webhook only fires on new uploads. To check files already in Box, or rerun one household:

```
npm run check -- <household folder id> ...
npm run check -- --all --compare     # every unit in BOX_BUILDING_FOLDER_ID vs data/households/expected_results.json
```

Reads `../.env`; set `BOX_DEVELOPER_TOKEN` or the `BOX_CCG_*` app. Each household takes 1-2 minutes (one Box AI call per document), so give the Lambda a timeout of at least 3 minutes.

## Required configuration

`BOX_CCG_CLIENT_ID`, `BOX_CCG_CLIENT_SECRET`, and `BOX_ENTERPRISE_ID` authenticate the Box CCG app. `BOX_WEBHOOK_PRIMARY_KEY` verifies incoming webhook deliveries. The Box app needs read/write files and folders plus Manage AI scopes and must be enterprise-authorized. `AWS_REGION` and AWS Lambda execution-role permission for `bedrock:InvokeModel` are required for the decider. Set `BOX_USER_ID` only to impersonate a managed user. Set `BOX_RESULTS_FOLDER_ID` to separate reports from source documents. `BOX_INPUTS_FOLDER_ID` is used only by the opt-in live webhook test.

## Deployment

Use Node.js 22.x with handler `index.handler`. Set API Gateway to pass the unmodified body and Box signature/timestamp headers. Build an upload artifact with `npm run package`; it creates `dist/fairhouse-webhook.zip`.

## Local credential validation

Copy `.env.example` into a shell environment without committing secrets, then run `npm run test:e2e`. The Box check validates CCG access to the results folder. The Bedrock check validates AWS credentials, regional model access, and invocation permission. Tests skip only when their corresponding configuration is absent and fail on invalid configured credentials.

To exercise the live Box webhook, set `BOX_INPUTS_FOLDER_ID`, `BOX_RESULTS_FOLDER_ID`, and `RUN_BOX_WEBHOOK_E2E=1`, then run `npm run test:e2e`. The test uploads a unique text fixture to the input folder and polls the results folder for `fairhouse-review-<file-id>.json` for up to 150 seconds.
