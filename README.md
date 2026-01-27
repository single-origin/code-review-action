# Code Review GitHub Action

SQL audit and conversational agent review for pull requests.

## Modes

This action supports two modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Audit** | Static SQL analysis with structured reports | Batch analysis of SQL files with table scan reports |
| **Agent** | AI-powered conversational review | Interactive code review with follow-up questions |

## Audit Mode (Default)

Audits SQL files in pull requests to uncover inefficiencies.

### Example Workflow

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
      - uses: single-origin/code-review-action@v2
        with:
          backend-url: ${{ secrets.SO_CODE_REVIEW_URL }}
          api-key: ${{ secrets.SO_CODE_REVIEW_API_KEY }}
```

### Inputs (Audit Mode)

| Input | Required | Description |
|-------|----------|-------------|
| `backend-url` | Yes | Single Origin backend API URL |
| `api-key` | Yes | API key (format: `{api_key_id}:{api_key_secret}`, base64-encoded) |
| `upload-artifact` | No | Whether to upload raw result as artifact (default: `false`) |
| `github-token` | No | GitHub token for posting comments |

### Outputs

| Output | Description |
|--------|-------------|
| `sqls-processed` | Number of SQL files processed |

---

## Agent Mode

AI-powered conversational SQL review with follow-up question support.

### Features

- Initial SQL file review on PR open/update
- Reply to review comments for interactive conversation
- Human handoff when other users are mentioned
- Re-engage with `@sql-agent`

### Example Workflow

```yaml
name: SQL Agent Review
on:
  pull_request:
    types: [opened, synchronize]
  pull_request_review_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: single-origin/code-review-action@v2
        with:
          agent-api-url: ${{ secrets.SO_AGENT_URL }}
          agent-api-key: ${{ secrets.SO_AGENT_API_KEY }}
```

### Inputs (Agent Mode)

| Input | Required | Description |
|-------|----------|-------------|
| `agent-api-url` | Yes | Agent API endpoint URL |
| `agent-api-key` | No | API key for agent authentication |
| `github-token` | No | GitHub token for posting comments |

### Conversation Flow

1. **Initial Review**: When a PR is opened or updated, the agent reviews SQL files and posts inline comments
2. **Follow-up**: Reply to the agent's comment to ask questions
3. **Handoff**: Mention another user (e.g., `@teammate`) to involve humans; agent steps back
4. **Re-engage**: Reply with `@sql-agent` to bring the agent back into the conversation

---

## Mode Detection

The action automatically detects which mode to use:

- If `backend-url` + `api-key` are provided → **Audit Mode**
- If `agent-api-url` is provided → **Agent Mode**

**Note**: You cannot specify both configurations simultaneously.

---

## Development

### Pushing PR

There is a test GitHub workflow that reacts to PR push to this repo. Set up the specified secrets, and push a PR to test.

### Required Secrets

| Secret | Mode | Description |
|--------|------|-------------|
| `SO_CODE_REVIEW_URL` | Audit | Backend API URL |
| `SO_CODE_REVIEW_API_KEY` | Audit | API key (base64-encoded) |
| `SO_AGENT_URL` | Agent | Agent API URL |
| `SO_AGENT_API_KEY` | Agent | Agent API key |

### Repository Variables

| Variable | Description |
|----------|-------------|
| `USE_AGENT_MODE` | Set to `true` to enable Agent mode in test workflow |

### Local Emulation

Use [act](https://github.com/nektos/act) and [gh](https://github.com/cli/cli) for local testing:

```bash
# Login with gh
gh auth login

# Run workflow locally
act -e context.json -s SO_CODE_REVIEW_URL=xxx -s SO_CODE_REVIEW_API_KEY=xxx pull_request
```

Example `context.json`:
```json
{
  "issue": {
    "number": 1
  },
  "repository": {
    "owner": { "login": "your-username" },
    "name": "your-repo"
  }
}
```
