# Code Review GitHub Action

AI-powered code review by Single Origin. Reviews pull request files and posts
inline comments. Supports reply threading for follow-up conversations.

## Setup

Add this workflow to your repository at `.github/workflows/review.yml`:

```yaml
name: Code Review
on:
  pull_request:
    types: [opened]
  pull_request_review_comment:
    types: [created]

concurrency:
  group: >-
    ${{ github.event_name == 'pull_request'
        && format('review-{0}', github.event.pull_request.number)
        || format('reply-{0}-{1}', github.event.pull_request.number,
    github.event.comment.id) }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: single-origin/code-review-action@v1
        with:
          backend-url: ${{ secrets.SO_BACKEND_URL }}
          api-key: ${{ secrets.SO_API_KEY }}
```

## Inputs

| Input             | Required | Default        | Description                                      |
| ----------------- | -------- | -------------- | ------------------------------------------------ |
| `backend-url`     | Yes      |                | Backend API base URL                             |
| `api-key`         | Yes      |                | API key (`id:secret`, base64-encoded)            |
| `github-token`    | No       | `github.token` | GitHub token for API calls                       |
| `timeout-seconds` | No       | `300`          | Backend request timeout in seconds               |
| `upload-artifact` | No       | `false`        | Upload raw result JSON as artifact for debugging |

## How It Works

### PR Review (`pull_request` event)

1. Lists changed files via GitHub API (paginated)
2. Filters out binary, deleted, and generated files
3. Fetches full file content for each reviewable file
4. Sends files to backend (`POST /api/v1/code-review/review`)
5. Posts inline review comments on the PR

### Reply Threading (`pull_request_review_comment` event)

1. Detects when a user replies to a bot-generated comment
2. Fetches the full conversation thread and file content
3. Sends context to backend (`POST /api/v1/code-review/reply`)
4. Posts a threaded reply

### File Filtering

Automatically skipped:

- Binary files
- Deleted files
- Generated/vendor files (`node_modules/`, `vendor/`, `dist/`, `*.min.js`, lock
  files, `*.pb.go`, etc.)

### Security

- Uses `pull_request` trigger only (safe from fork injection attacks)
- API key is masked in logs via `core.setSecret()`
- `GITHUB_TOKEN` scoped to minimum permissions (`pull-requests: write`,
  `contents: read`)

### Concurrency

- PR reviews: cancel-in-progress (rapid pushes cancel stale reviews)
- Reply threads: independent runs per comment

### Fork PRs

Fork PRs do not receive reviews. The `pull_request` trigger provides a read-only
`GITHUB_TOKEN` and no access to repo secrets for fork PRs.

## Development

```bash
npm install
npm run test         # jest unit tests
npm run package      # rollup bundle to dist/
npm run lint         # eslint
npm run format:write # prettier --write
npm run format:check # prettier --check
npm run all          # format + lint + test + package
```

The `dist/index.js` file is committed. After making changes, run
`npm run package` and commit the updated `dist/`.

### Local Testing with local-action

Test against your local backend using
[`@github/local-action`](https://github.com/github/local-action):

1. Copy `.env.example` to `.env` and fill in your values
2. Run: `npm run local-action`

## TODO

- [ ] Incremental reviews: on `synchronize` events, use the compare API
      (`GET /compare/{before}...{after}`) to send only newly changed files with
      `REVIEW_SCOPE_INCREMENTAL`, and include existing bot comment threads for
      context
