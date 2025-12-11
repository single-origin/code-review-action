# Code Review GitHub Action

Audits SQL files in pull requests to uncover inefficiencies

## Usage

```yaml
- uses: single-origin/code-review-action@v1
  with:
    backend-hostname: ${{ secrets.SO_CODE_REVIEW_HOSTNAME }}
    api-key: ${{ secrets.SO_CODE_REVIEW_API_KEY }}
```

## Inputs

- `backend-hostname` (required): Single Origin backend API hostname
- `api-key` (required): Your API key
- `github-token` (optional): GitHub token for posting comments

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
          backend-hostname: ${{ secrets.SO_CODE_REVIEW_HOSTNAME }}
          api-key: ${{ secrets.SO_CODE_REVIEW_API_KEY }}
```

## Backend Hostname

This is the hostname for the API endpoint that is specific to your deployment, contact Single Origin for the hostname to use.
