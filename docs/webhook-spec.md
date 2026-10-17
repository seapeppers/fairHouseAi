# FairHouse AI Box webhook Lambda

## Supported trigger

The Lambda accepts only a Box `FILE.UPLOADED` webhook delivered through API Gateway Lambda proxy integration. It verifies `box-signature` using `BOX_WEBHOOK_PRIMARY_KEY` and the raw request body plus `box-delivery-timestamp`. Configure the Box webhook to watch the household folder hierarchy and deliver to the API Gateway URL.

## Processing contract

1. The trigger file must have a parent folder. That folder is treated as the household file.
2. The Lambda lists every file in that folder, excluding resident demographic forms and its own `fairhouse-review-*.json` reports. Demographic forms are never submitted to extraction or decisioning.
3. It uses Box CCG credentials to invoke structured Box AI extracts for each eligible file.
4. It sends the extracts to Amazon Bedrock `amazon.nova-2-lite-v1` (the Strands Decider 2B deployment) and requires JSON identifying only evidence that needs human review. It does not determine eligibility or calculate income.
5. It uploads `fairhouse-review-<trigger-file-id>.json` to `BOX_RESULTS_FOLDER_ID`, or the household folder when unset. When review is required and `BOX_REVIEWER_USER_ID` is set, it creates a Box review task on the trigger file.

## Required configuration

`BOX_CLIENT_ID`, `BOX_CLIENT_SECRET`, and `BOX_ENTERPRISE_ID` authenticate the Box CCG app. `BOX_WEBHOOK_PRIMARY_KEY` verifies incoming webhook deliveries. The Box app needs read/write files and folders plus Manage AI scopes and must be enterprise-authorized. `AWS_REGION` and AWS Lambda execution-role permission for `bedrock:InvokeModel` are required for the decider. Set `BOX_USER_ID` only to impersonate a managed user. Set `BOX_RESULTS_FOLDER_ID` to separate reports from source documents. `BOX_INPUTS_FOLDER_ID` is used only by the opt-in live webhook test.

## Deployment

Use Node.js 22.x with handler `index.handler`. Set API Gateway to pass the unmodified body and Box signature/timestamp headers. Build an upload artifact with `npm run package`; it creates `dist/fairhouse-webhook.zip`.

## Local credential validation

Copy `.env.example` into a shell environment without committing secrets, then run `npm run test:e2e`. The Box check validates CCG access to the results folder. The Bedrock check validates AWS credentials, regional model access, and invocation permission. Tests skip only when their corresponding configuration is absent and fail on invalid configured credentials.

To exercise the live Box webhook, set `BOX_INPUTS_FOLDER_ID`, `BOX_RESULTS_FOLDER_ID`, and `RUN_BOX_WEBHOOK_E2E=1`, then run `npm run test:e2e`. The test uploads a unique text fixture to the input folder and polls the results folder for `fairhouse-review-<file-id>.json` for up to 150 seconds.
