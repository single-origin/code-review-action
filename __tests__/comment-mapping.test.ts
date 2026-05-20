import { describe, expect, it } from '@jest/globals'
import { mapCommentsForReview, buildReviewBody } from '../src/github'
import { COMMENT_MARKER } from '../src/constants'
import { CodeReviewStatus } from '../src/types'
import type { ReviewResponse } from '../src/types'

describe('mapCommentsForReview', () => {
  it('maps a single-line comment (endLine = 0)', () => {
    const result = mapCommentsForReview([
      { path: 'src/foo.ts', startLine: 10, endLine: 0, body: 'Fix this' }
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      path: 'src/foo.ts',
      body: `${COMMENT_MARKER}\nFix this`,
      side: 'RIGHT',
      line: 10
    })
    expect(result[0].start_line).toBeUndefined()
  })

  it('maps a single-line comment (endLine equals startLine)', () => {
    const result = mapCommentsForReview([
      { path: 'src/foo.ts', startLine: 5, endLine: 5, body: 'Nit' }
    ])

    expect(result[0].line).toBe(5)
    expect(result[0].start_line).toBeUndefined()
  })

  it('maps a multi-line comment', () => {
    const result = mapCommentsForReview([
      {
        path: 'src/bar.py',
        startLine: 10,
        endLine: 15,
        body: 'Refactor this block'
      }
    ])

    expect(result[0]).toEqual({
      path: 'src/bar.py',
      body: `${COMMENT_MARKER}\nRefactor this block`,
      side: 'RIGHT',
      line: 15,
      start_line: 10
    })
  })

  it('prepends comment marker to every comment', () => {
    const result = mapCommentsForReview([
      { path: 'a.ts', startLine: 1, endLine: 0, body: 'First' },
      { path: 'b.ts', startLine: 2, endLine: 0, body: 'Second' }
    ])

    for (const c of result) {
      expect(c.body.startsWith(COMMENT_MARKER)).toBe(true)
    }
  })

  it('returns empty array for no comments', () => {
    expect(mapCommentsForReview([])).toEqual([])
  })
})

describe('buildReviewBody', () => {
  const base: ReviewResponse = {
    status: CodeReviewStatus.COMPLETED,
    summary: '',
    comments: [],
    fileErrors: [],
    error: ''
  }

  it('returns summary when present', () => {
    const body = buildReviewBody({ ...base, summary: 'Looks good overall' })
    expect(body).toBe('Looks good overall')
  })

  it('returns undefined when no summary and no errors', () => {
    expect(buildReviewBody(base)).toBeUndefined()
  })

  it('appends file errors to summary', () => {
    const body = buildReviewBody({
      ...base,
      summary: 'Partial review',
      fileErrors: [
        { filename: 'big.ts', error: 'Exceeded context window' },
        { filename: 'slow.ts', error: 'Model timeout' }
      ]
    })

    expect(body).toContain('Partial review')
    expect(body).toContain('Some files could not be reviewed')
    expect(body).toContain('`big.ts`: Exceeded context window')
    expect(body).toContain('`slow.ts`: Model timeout')
  })

  it('shows file errors even without summary', () => {
    const body = buildReviewBody({
      ...base,
      fileErrors: [{ filename: 'x.ts', error: 'Failed' }]
    })

    expect(body).toContain('`x.ts`: Failed')
  })
})
