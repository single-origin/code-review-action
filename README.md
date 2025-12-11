# Code Review GitHub Action

Audits SQL files in pull requests to uncover inefficiencies

## Example Workflow

```yaml
name: Single Origin Code Review
on:
  pull_request:
    paths:
      - '**.sql'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: single-origin/code-review-action@v1
        with:
          backend-hostname: xxx-api.singleorigin.tech
          api-key: ${{ secrets.SO_CODE_REVIEW_API_KEY }}
```

## Inputs

- `backend-hostname` (required): Single Origin backend API hostname
  - This is the hostname for the API endpoint that is specific to your deployment, contact Single Origin for the hostname to use.
- `api-key` (required): Your API key
  - The value shall be in the format of `{api_key_id}:{api_key_secret}` and base64-encoded.
- `github-token` (optional): GitHub token for posting comments
