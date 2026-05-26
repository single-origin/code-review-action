import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { CodeReviewStatus, ReviewFileStatus, ReviewScope } from '../src/types'
import type {
  ReviewFile,
  ReviewResponse,
  ReplyToReviewThreadResponse,
  ThreadComment
} from '../src/types'
import { COMMENT_MARKER, BOT_LOGIN } from '../src/constants'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '..', '__fixtures__', name), 'utf-8')
  )

const prOpenedPayload = fixture('pull_request.opened.json')
const prSyncPayload = fixture('pull_request.synchronize.json')
const reviewCommentPayload = fixture('review_comment.created.json')
const botCommentPayload = fixture('review_comment.bot.json')

// --- Mocks ---

const mockGetInput =
  jest.fn<(name: string, options?: { required?: boolean }) => string>()
const mockSetSecret = jest.fn<(secret: string) => void>()
const mockInfo = jest.fn<(message: string) => void>()
const mockSetFailed = jest.fn<(message: string | Error) => void>()
const mockSetOutput = jest.fn<(name: string, value: string) => void>()

const mockContext = {
  eventName: 'pull_request',
  payload: {} as Record<string, unknown>,
  repo: { owner: 'test-owner', repo: 'test-repo' }
}

const mockGetOctokit = jest.fn().mockReturnValue({})

jest.unstable_mockModule('@actions/core', () => ({
  getInput: mockGetInput,
  setSecret: mockSetSecret,
  info: mockInfo,
  setFailed: mockSetFailed,
  setOutput: mockSetOutput
}))

jest.unstable_mockModule('@actions/github', () => ({
  context: mockContext,
  getOctokit: mockGetOctokit
}))

const mockFetchFilesForReview =
  jest.fn<
    (...args: unknown[]) => Promise<{ files: ReviewFile[]; skipped: [] }>
  >()
const mockPostReview = jest.fn<(...args: unknown[]) => Promise<void>>()
const mockGetCommentThread =
  jest.fn<
    (...args: unknown[]) => Promise<{ thread: ThreadComment[]; path: string }>
  >()
const mockGetFileForComment =
  jest.fn<(...args: unknown[]) => Promise<ReviewFile | null>>()
const mockPostReply = jest.fn<(...args: unknown[]) => Promise<void>>()

jest.unstable_mockModule('../src/github.js', () => ({
  fetchFilesForReview: mockFetchFilesForReview,
  postReview: mockPostReview,
  getCommentThread: mockGetCommentThread,
  getFileForComment: mockGetFileForComment,
  postReply: mockPostReply
}))

const mockCallReview =
  jest.fn<(...args: unknown[]) => Promise<ReviewResponse>>()
const mockCallReply =
  jest.fn<(...args: unknown[]) => Promise<ReplyToReviewThreadResponse>>()

jest.unstable_mockModule('../src/backend.js', () => ({
  callReview: mockCallReview,
  callReply: mockCallReply
}))

// Dynamic import after mocks are registered
let run: () => Promise<void>

beforeEach(async () => {
  jest.clearAllMocks()

  mockGetInput.mockImplementation((name: string) => {
    const inputs: Record<string, string> = {
      'backend-url': 'http://localhost:8080',
      'api-key': 'test-key',
      'github-token': 'ghp_test',
      'timeout-seconds': '300',
      'file-filter': '**/*.sql',
      'upload-artifact': 'false'
    }
    return inputs[name] ?? ''
  })

  mockContext.eventName = 'pull_request'
  mockContext.payload = {}
  mockContext.repo = { owner: 'test-owner', repo: 'test-repo' }

  const main = await import('../src/main.js')
  run = main.run
})

// --- Helpers ---

const sampleFile: ReviewFile = {
  filename: 'src/app.ts',
  status: ReviewFileStatus.MODIFIED,
  patch: '@@ -1,3 +1,4 @@\n+import foo',
  content: 'import foo\n'
}

function reviewResponse(
  overrides: Partial<ReviewResponse> = {}
): ReviewResponse {
  return {
    status: CodeReviewStatus.COMPLETED,
    summary: 'Looks good',
    comments: [
      { path: 'src/app.ts', startLine: 1, endLine: 1, body: 'Nitpick here' }
    ],
    fileErrors: [],
    error: '',
    ...overrides
  }
}

function replyResponse(
  overrides: Partial<ReplyToReviewThreadResponse> = {}
): ReplyToReviewThreadResponse {
  return {
    status: CodeReviewStatus.COMPLETED,
    body: 'That variable is mutable because...',
    ...overrides
  }
}

const botThread: ThreadComment[] = [
  {
    id: 99,
    user: BOT_LOGIN,
    body: `${COMMENT_MARKER}\nConsider making this immutable`,
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 100,
    user: 'developer',
    body: 'Can you explain why this variable is mutable?',
    createdAt: '2026-01-01T00:01:00Z'
  }
]

// --- Tests ---

describe('run()', () => {
  describe('pull_request event', () => {
    beforeEach(() => {
      mockContext.eventName = 'pull_request'
      mockContext.payload = structuredClone(prOpenedPayload)
    })

    it('reviews PR and posts inline comments', async () => {
      mockFetchFilesForReview.mockResolvedValue({
        files: [sampleFile],
        skipped: []
      })
      mockCallReview.mockResolvedValue(reviewResponse())

      await run()

      expect(mockFetchFilesForReview).toHaveBeenCalledWith(
        expect.anything(),
        'test-owner',
        'test-repo',
        prOpenedPayload.pull_request.number,
        prOpenedPayload.pull_request.head.sha,
        '**/*.sql'
      )
      expect(mockCallReview).toHaveBeenCalledWith(
        expect.objectContaining({ backendUrl: 'http://localhost:8080' }),
        expect.objectContaining({
          repository: { fullName: 'test-owner/test-repo' },
          pullRequest: {
            number: prOpenedPayload.pull_request.number,
            scope: ReviewScope.FULL
          },
          files: [sampleFile]
        })
      )
      expect(mockPostReview).toHaveBeenCalledWith(
        expect.anything(),
        'test-owner',
        'test-repo',
        prOpenedPayload.pull_request.number,
        expect.objectContaining({ comments: expect.any(Array) })
      )
      expect(mockSetFailed).not.toHaveBeenCalled()
    })

    it('skips synchronize action without calling backend', async () => {
      mockContext.payload = structuredClone(prSyncPayload)

      await run()

      expect(mockInfo).toHaveBeenCalledWith(
        'Skipping synchronize event (not supported)'
      )
      expect(mockFetchFilesForReview).not.toHaveBeenCalled()
      expect(mockCallReview).not.toHaveBeenCalled()
      expect(mockPostReview).not.toHaveBeenCalled()
    })

    it('exits early when no reviewable files found', async () => {
      mockFetchFilesForReview.mockResolvedValue({
        files: [],
        skipped: []
      })

      await run()

      expect(mockCallReview).not.toHaveBeenCalled()
      expect(mockPostReview).not.toHaveBeenCalled()
      expect(mockInfo).toHaveBeenCalledWith('No reviewable files found')
    })

    it('does not post review when backend returns no comments', async () => {
      mockFetchFilesForReview.mockResolvedValue({
        files: [sampleFile],
        skipped: []
      })
      mockCallReview.mockResolvedValue(
        reviewResponse({ comments: [], summary: '' })
      )

      await run()

      expect(mockPostReview).not.toHaveBeenCalled()
      expect(mockInfo).toHaveBeenCalledWith('No review comments to post')
    })

    it('fails when backend returns FAILED with no comments', async () => {
      mockFetchFilesForReview.mockResolvedValue({
        files: [sampleFile],
        skipped: []
      })
      mockCallReview.mockResolvedValue(
        reviewResponse({
          status: CodeReviewStatus.FAILED,
          comments: [],
          error: 'Internal server error'
        })
      )

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        'Review failed: Internal server error'
      )
      expect(mockPostReview).not.toHaveBeenCalled()
    })

    it('posts partial results when backend fails but has comments', async () => {
      mockFetchFilesForReview.mockResolvedValue({
        files: [sampleFile],
        skipped: []
      })
      mockCallReview.mockResolvedValue(
        reviewResponse({
          status: CodeReviewStatus.FAILED,
          error: 'Partial failure'
        })
      )

      await run()

      expect(mockPostReview).toHaveBeenCalled()
      expect(mockSetFailed).not.toHaveBeenCalled()
    })

    it('writes artifact when upload-artifact is enabled', async () => {
      mockGetInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = {
          'backend-url': 'http://localhost:8080',
          'api-key': 'test-key',
          'github-token': 'ghp_test',
          'timeout-seconds': '300',
          'file-filter': '**/*.sql',
          'upload-artifact': 'true'
        }
        return inputs[name] ?? ''
      })

      mockFetchFilesForReview.mockResolvedValue({
        files: [sampleFile],
        skipped: []
      })
      mockCallReview.mockResolvedValue(reviewResponse())

      await run()

      expect(mockSetOutput).toHaveBeenCalledWith(
        'artifact-path',
        '/tmp/code-review-result.json'
      )
    })

    it('fails when payload has no pull_request', async () => {
      mockContext.payload = { action: 'opened' }

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith(
        'No pull_request in event payload'
      )
    })
  })

  describe('pull_request_review_comment event', () => {
    beforeEach(() => {
      mockContext.eventName = 'pull_request_review_comment'
      mockContext.payload = structuredClone(reviewCommentPayload)
    })

    it('replies to a human comment on a bot thread', async () => {
      mockGetCommentThread.mockResolvedValue({
        thread: botThread,
        path: 'src/main.ts'
      })
      mockGetFileForComment.mockResolvedValue(sampleFile)
      mockCallReply.mockResolvedValue(replyResponse())

      await run()

      expect(mockGetCommentThread).toHaveBeenCalledWith(
        expect.anything(),
        'test-owner',
        'test-repo',
        reviewCommentPayload.pull_request.number,
        reviewCommentPayload.comment.id
      )
      expect(mockCallReply).toHaveBeenCalledWith(
        expect.objectContaining({ backendUrl: 'http://localhost:8080' }),
        expect.objectContaining({
          repository: { fullName: 'test-owner/test-repo' },
          file: sampleFile,
          thread: botThread
        })
      )
      // Root id should be thread[0].id (99), not the trigger comment id (100)
      expect(mockPostReply).toHaveBeenCalledWith(
        expect.anything(),
        'test-owner',
        'test-repo',
        reviewCommentPayload.pull_request.number,
        99,
        'That variable is mutable because...'
      )
    })

    it('skips bot-authored comment before fetching thread', async () => {
      mockContext.payload = structuredClone(botCommentPayload)

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping: bot_author')
      expect(mockGetCommentThread).not.toHaveBeenCalled()
      expect(mockCallReply).not.toHaveBeenCalled()
    })

    it('skips comment containing the marker before fetching thread', async () => {
      mockContext.payload = structuredClone(reviewCommentPayload)
      ;(mockContext.payload as Record<string, unknown>).comment = {
        ...(reviewCommentPayload.comment as Record<string, unknown>),
        body: `${COMMENT_MARKER}\nSome bot text`,
        user: { login: 'other-bot' }
      }

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping: marked_comment')
      expect(mockGetCommentThread).not.toHaveBeenCalled()
    })

    it('skips when thread has no bot comments', async () => {
      const humanOnlyThread: ThreadComment[] = [
        {
          id: 99,
          user: 'developer',
          body: 'I wrote this comment',
          createdAt: '2026-01-01T00:00:00Z'
        },
        {
          id: 100,
          user: 'developer',
          body: 'Can you explain why this variable is mutable?',
          createdAt: '2026-01-01T00:01:00Z'
        }
      ]
      mockGetCommentThread.mockResolvedValue({
        thread: humanOnlyThread,
        path: 'src/main.ts'
      })

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Skipping: no_bot_in_thread')
      expect(mockCallReply).not.toHaveBeenCalled()
    })

    it('fails when backend reply returns FAILED', async () => {
      mockGetCommentThread.mockResolvedValue({
        thread: botThread,
        path: 'src/main.ts'
      })
      mockGetFileForComment.mockResolvedValue(sampleFile)
      mockCallReply.mockResolvedValue(
        replyResponse({
          status: CodeReviewStatus.FAILED,
          body: 'Backend error'
        })
      )

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith('Reply failed: Backend error')
      expect(mockPostReply).not.toHaveBeenCalled()
    })

    it('does not post reply when body is empty', async () => {
      mockGetCommentThread.mockResolvedValue({
        thread: botThread,
        path: 'src/main.ts'
      })
      mockGetFileForComment.mockResolvedValue(sampleFile)
      mockCallReply.mockResolvedValue(replyResponse({ body: '' }))

      await run()

      expect(mockPostReply).not.toHaveBeenCalled()
      expect(mockSetFailed).not.toHaveBeenCalled()
    })
  })

  describe('unsupported event', () => {
    it('logs info and passes on unknown event type', async () => {
      mockContext.eventName = 'issues'
      mockContext.payload = {}

      await run()

      expect(mockInfo).toHaveBeenCalledWith('Unsupported event: issues')
      expect(mockSetFailed).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('catches and reports thrown errors', async () => {
      mockContext.eventName = 'pull_request'
      mockContext.payload = structuredClone(prOpenedPayload)
      mockFetchFilesForReview.mockRejectedValue(new Error('Network timeout'))

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith('Network timeout')
    })

    it('handles non-Error throws', async () => {
      mockContext.eventName = 'pull_request'
      mockContext.payload = structuredClone(prOpenedPayload)
      mockFetchFilesForReview.mockRejectedValue('string error')

      await run()

      expect(mockSetFailed).toHaveBeenCalledWith('string error')
    })
  })
})
