import { describe, expect, it } from '@jest/globals'
import type { PullRequestReviewComment } from '@octokit/webhooks-types'
import { shouldSkipComment } from '../src/loop-prevention'
import { COMMENT_MARKER, BOT_LOGIN } from '../src/constants'
import type { ThreadComment } from '../src/types'

const comment = (
  overrides: Partial<Pick<PullRequestReviewComment, 'user' | 'body'>>
) =>
  ({
    user: { login: 'developer' },
    body: 'hello',
    ...overrides
  }) as PullRequestReviewComment

describe('shouldSkipComment', () => {
  describe('author check', () => {
    it('skips comments from the bot', () => {
      expect(shouldSkipComment(comment({ user: { login: BOT_LOGIN } }))).toBe(
        'bot_author'
      )
    })

    it('does not skip comments from other users', () => {
      expect(shouldSkipComment(comment({}))).toBeNull()
    })
  })

  describe('marker check', () => {
    it('skips comments containing the marker', () => {
      expect(
        shouldSkipComment(
          comment({ body: `${COMMENT_MARKER}\nSome review text` })
        )
      ).toBe('marked_comment')
    })

    it('does not skip comments without the marker', () => {
      expect(
        shouldSkipComment(comment({ body: 'Just a regular comment' }))
      ).toBeNull()
    })
  })

  describe('thread check', () => {
    const userComment = comment({ body: 'Why did you flag this?' })

    it('skips when thread has no bot comments', () => {
      const thread: ThreadComment[] = [
        {
          id: 1,
          user: 'developer',
          body: 'First comment',
          createdAt: '2026-01-01T00:00:00Z'
        },
        {
          id: 2,
          user: 'other-dev',
          body: 'I agree',
          createdAt: '2026-01-01T01:00:00Z'
        }
      ]

      expect(shouldSkipComment(userComment, thread)).toBe('no_bot_in_thread')
    })

    it('does not skip when thread contains bot user', () => {
      const thread: ThreadComment[] = [
        {
          id: 1,
          user: BOT_LOGIN,
          body: 'Consider refactoring',
          createdAt: '2026-01-01T00:00:00Z'
        },
        {
          id: 2,
          user: 'developer',
          body: 'Why?',
          createdAt: '2026-01-01T01:00:00Z'
        }
      ]

      expect(shouldSkipComment(userComment, thread)).toBeNull()
    })

    it('does not skip when thread contains comment marker', () => {
      const thread: ThreadComment[] = [
        {
          id: 1,
          user: 'some-other-bot',
          body: `${COMMENT_MARKER}\nReview comment`,
          createdAt: '2026-01-01T00:00:00Z'
        }
      ]

      expect(shouldSkipComment(userComment, thread)).toBeNull()
    })

    it('skips on empty thread', () => {
      expect(shouldSkipComment(userComment, [])).toBe('no_bot_in_thread')
    })

    it('does not check thread when thread is not provided', () => {
      expect(shouldSkipComment(userComment)).toBeNull()
    })
  })

  describe('priority', () => {
    it('bot author takes precedence over thread check', () => {
      const thread: ThreadComment[] = [
        {
          id: 1,
          user: BOT_LOGIN,
          body: `${COMMENT_MARKER}\nbot comment`,
          createdAt: '2026-01-01T00:00:00Z'
        }
      ]

      expect(
        shouldSkipComment(
          comment({ user: { login: BOT_LOGIN }, body: 'hi' }),
          thread
        )
      ).toBe('bot_author')
    })

    it('marker takes precedence over thread check', () => {
      const thread: ThreadComment[] = [
        {
          id: 1,
          user: 'developer',
          body: 'no bot here',
          createdAt: '2026-01-01T00:00:00Z'
        }
      ]

      expect(
        shouldSkipComment(
          comment({ body: `${COMMENT_MARKER}\nmarked` }),
          thread
        )
      ).toBe('marked_comment')
    })
  })
})
