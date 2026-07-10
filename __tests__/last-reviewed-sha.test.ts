import { describe, it, expect } from '@jest/globals'
import { getLastReviewedSha } from '../src/github'
import { COMMENT_MARKER, BOT_LOGIN } from '../src/constants'

type Review = {
  user?: { login: string } | null
  body?: string
  commit_id?: string | null
}

// Minimal octokit stub: getLastReviewedSha only uses octokit.paginate(listReviews, ...),
// which we make resolve to the provided reviews array (oldest-first, as GitHub returns).
function octokitWith(reviews: Review[]) {
  return {
    paginate: async () => reviews,
    rest: { pulls: { listReviews: () => {} } }
  } as never
}

const ours = (commit_id: string, extra = ''): Review => ({
  user: { login: BOT_LOGIN },
  body: `${COMMENT_MARKER}\n${extra}`,
  commit_id
})

describe('getLastReviewedSha', () => {
  it('returns the newest review carrying our marker', async () => {
    const sha = await getLastReviewedSha(
      octokitWith([ours('sha-old'), ours('sha-new')]),
      'o',
      'r',
      1
    )
    expect(sha).toBe('sha-new')
  })

  it('ignores another action posting as github-actions[bot] without our marker', async () => {
    // A different action's review: same bot login, its own commit, but no COMMENT_MARKER.
    const otherAction: Review = {
      user: { login: BOT_LOGIN },
      body: 'Lint passed ✅',
      commit_id: 'other-action-sha'
    }
    const sha = await getLastReviewedSha(
      octokitWith([ours('our-sha'), otherAction]),
      'o',
      'r',
      1
    )
    expect(sha).toBe('our-sha')
  })

  it('returns null when no review carries our marker', async () => {
    const sha = await getLastReviewedSha(
      octokitWith([
        { user: { login: BOT_LOGIN }, body: 'unrelated', commit_id: 'x' },
        { user: { login: 'someone' }, body: 'human review', commit_id: 'y' }
      ]),
      'o',
      'r',
      1
    )
    expect(sha).toBeNull()
  })

  it('skips a marked review with no commit_id and keeps scanning', async () => {
    const sha = await getLastReviewedSha(
      octokitWith([
        ours('older-sha'),
        { user: { login: BOT_LOGIN }, body: COMMENT_MARKER, commit_id: null }
      ]),
      'o',
      'r',
      1
    )
    expect(sha).toBe('older-sha')
  })
})
