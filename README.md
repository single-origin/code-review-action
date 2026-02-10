# SQL Code Review Agent

AI-powered SQL code review GitHub Action with conversation support.

## Features

- Automatically reviews SQL files in Pull Requests
- Supports follow-up conversations in review comment threads
- Smart handoff to humans when other users are mentioned
- Re-engage with `@sql-agent` after handoff

## Usage

### Basic Setup

Add this to your repository's workflow file (e.g., `.github/workflows/sql-review.yml`):

```yaml
name: SQL Code Review
on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - '**.sql'
  pull_request_review_comment:
    types: [created]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: single-origin/code-review-action@v1
        with:
          agent-api-url: ${{ secrets.SO_AGENT_URL }}
          agent-api-key: ${{ secrets.SO_AGENT_API_KEY }}
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `agent-api-url` | URL of the Agent API endpoint | Yes | - |
| `agent-api-key` | API key for agent authentication | Yes | - |
| `github-token` | GitHub token for posting comments | No | `${{ github.token }}` |

### Secrets Configuration

Go to your repo **Settings > Secrets and variables > Actions** and add:

| Secret Name | Value |
|-------------|-------|
| `SO_AGENT_URL` | SO Agent API URL (e.g., `https://your-api.example.com`) |
| `SO_AGENT_API_KEY` |  API key for authentication |

## How It Works

```
┌──────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  PR Created  │────>│  GitHub Action  │────>│   Agent API     │
│  or Comment  │     │  (this action)  │     │   (endpoint)    │
└──────────────┘     └────────┬────────┘     └────────┬────────┘
                              │                       │
                              │   POST review request │
                              │                       │
                              │<──────────────────────┘
                              │   review response     │
                              │
                     ┌────────▼────────┐
                     │  Post Comment   │
                     │  on PR          │
                     └─────────────────┘
```

## SQL File Detection

The action reviews files that end with `.sql`.

## Conversation Flow

1. **Initial Review**: When a PR is opened or updated, the agent reviews SQL files and posts inline comments
2. **Follow-up**: Reply to the agent's comment to ask questions
3. **Handoff**: Mention another user (e.g., `@teammate`) to involve humans; agent steps back
4. **Re-engage**: Reply with `@sql-agent` to bring the agent back into the conversation

## Development

### Testing

This repository includes a test workflow. To test:

1. Create a PR with SQL file changes
2. The action will automatically review the SQL files
3. Reply in the comment thread to test follow-up conversations

### Local Emulation

The above method runs the main action code in the actual Github environment that accrues cost and subjects to resource availability and start-up delay.  The local emulation with `act` can be helpful for quicker iterations.

- Install [act](https://github.com/nektos/act) and [gh](https://github.com/cli/cli).
- Get a local auth token with `gh`
  - `gh auth login`
- Push a PR
  - We still need to push a PR with test files because currently the action only works with PR
- Run workflow locally
  - `act -e {context_json_file} -s {secret_1} -s {secret_2} pull_request`
    - `context_json_file` is a JSON file that contains context data such as PR number, sample file content

      ```
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

    - `secret_1` and `secret_2` are whatever the secrets are needed for the test action

### Required Secrets

| Secret | Description |
|--------|-------------|
| `SO_AGENT_URL` | Agent API URL |
| `SO_AGENT_API_KEY` | Agent API key |
