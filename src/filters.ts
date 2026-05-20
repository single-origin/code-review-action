import { GENERATED_PATTERNS } from './constants.js'

interface PullsFileItem {
  filename: string
  status: string
  patch?: string
  additions: number
  deletions: number
}

export function isBinary(file: PullsFileItem): boolean {
  return !file.patch && file.additions === 0 && file.deletions === 0
}

export function isGenerated(filename: string): boolean {
  for (const pattern of GENERATED_PATTERNS) {
    if (pattern.startsWith('*')) {
      const suffix = pattern.slice(1)
      if (filename.endsWith(suffix)) return true
    } else if (pattern.endsWith('/')) {
      if (filename.startsWith(pattern) || filename.includes(`/${pattern}`)) {
        return true
      }
    } else if (filename === pattern || filename.endsWith(`/${pattern}`)) {
      return true
    }
  }
  return false
}

export function shouldSkip(file: PullsFileItem): string | null {
  if (isBinary(file)) return 'binary'
  if (file.status === 'removed') return 'removed'
  if (isGenerated(file.filename)) return 'generated'
  return null
}
