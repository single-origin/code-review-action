export const COMMENT_MARKER = '<!-- single-origin-code-review -->'

export const BOT_LOGIN = 'github-actions[bot]'

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
