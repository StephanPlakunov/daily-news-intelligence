# Operations Guide

## What To Monitor

- Lambda errors on `FetchAndSummarizeFunction`
- Lambda errors on `GenerateDigestFunction`
- API Gateway 5xx rate
- CloudFront cache invalidation and deployment status

## Common Failure Modes

### No digest is returned for a date

- Check whether generation failed because NewsAPI returned no matching articles for the inferred topics.
- Trigger `POST /digest` again from the UI to generate the curated trending set.
- If only one custom topic failed, try a broader query phrase.

### Scheduled generation fails

- Check CloudWatch logs for `FetchAndSummarizeFunction`.
- Review the EventBridge Scheduler dead-letter queue.
- Confirm that both secret ARNs still point to valid plain-text secrets.

### Frontend loads but generation fails

- Confirm `VITE_API_BASE_URL` points to the deployed API Gateway stage.
- Check whether the Lambda execution role can read DynamoDB and both secrets.
- Inspect the API response body for the explicit error code to distinguish invalid requests, upstream failures, and service configuration problems.

## Demo Checklist

- Open the CloudFront URL.
- Show a day with already stored trending topics.
- Change the date to a day after `2026-04-01` and trigger generation from the UI.
- Add a custom topic and reload the same day to prove persistence.
- Mention the CI and deploy workflows in GitHub Actions.
