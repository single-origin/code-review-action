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
          backend-url: https://xxx-api.singleorigin.tech
          api-key: ${{ secrets.SO_CODE_REVIEW_API_KEY }}
```

## Inputs

- `backend-url` (required): Single Origin backend API url
  - This is the url for the API endpoint that is specific to your deployment, contact Single Origin for the url to use.
- `api-key` (required): Your API key
  - The value shall be in the format of `{api_key_id}:{api_key_secret}` and base64-encoded.
- `github-token` (optional): GitHub token for posting comments

## Development

### Pushing PR

There is a test github workflow that reacts to PR push to this repo.  Set up the specified secrets, and push a PR to test.

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
