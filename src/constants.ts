export const COMMENT_MARKER = '<!-- single-origin-code-review -->'

export const BOT_LOGIN = 'github-actions[bot]'

// Review body posted when a review produced no inline comments. Posting a review
// (rather than nothing) leaves a commit_id marker so the next incremental review
// knows this commit was already reviewed.
export const NO_ISSUES_MESSAGE = 'No new issues found.'

export const GENERATED_PATTERNS: string[] = [
  'vendor/',
  'node_modules/',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'go.sum',
  'dist/',
  '*.min.js',
  '*.min.css',
  '*.pb.go',
  '*.generated.*',
  '__generated__/',
  '.next/',
  'target/'
]

export const CONCURRENCY_LIMIT = 10
