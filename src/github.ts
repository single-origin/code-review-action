import * as core from '@actions/core'
import * as github from '@actions/github'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import {
  BOT_LOGIN,
  COMMENT_MARKER,
  CONCURRENCY_LIMIT,
  NO_ISSUES_MESSAGE
} from './constants.js'
import { shouldSkip } from './filters.js'
import {
  ReviewComment,
  ReviewFile,
  ReviewFileStatus,
  ReviewResponse,
  SkippedFile,
  ThreadComment
} from './types.js'

type Octokit = ReturnType<typeof github.getOctokit>

type CreateReviewComment = NonNullable<
  RestEndpointMethodTypes['pulls']['createReview']['parameters']['comments']
>[number]

type DiffEntry =
  RestEndpointMethodTypes['pulls']['listFiles']['response']['data'][number]

type CompareFile = NonNullable<
  RestEndpointMethodTypes['repos']['compareCommits']['response']['data']['files']
>[number]

export interface FetchResult {
  files: ReviewFile[]
  skipped: SkippedFile[]
}

export interface CompareResult extends FetchResult {
  // Comparison status reported by GitHub: 'ahead' | 'behind' | 'identical' | 'diverged'.
  status: string
  // True only when headSha is a linear descendant of the base (status 'ahead'), so the
  // compare diff is exactly the commits pushed since the last review. Otherwise (force-push
  // or rebase producing 'diverged', etc.) the caller should fall back to a full review.
  incremental: boolean
}

function toReviewFileStatus(status: string): ReviewFileStatus {
  switch (status) {
    case 'added':
      return ReviewFileStatus.ADDED
    case 'modified':
    case 'changed':
      return ReviewFileStatus.MODIFIED
    case 'removed':
      return ReviewFileStatus.REMOVED
    case 'renamed':
      return ReviewFileStatus.RENAMED
    default:
      return ReviewFileStatus.UNSPECIFIED
  }
}

async function limitConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = []
  let index = 0

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }

  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(limit, tasks.length); i++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  return results
}

async function buildReviewFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  headSha: string,
  fileFilter: string | undefined,
  entries: (DiffEntry | CompareFile)[]
): Promise<FetchResult> {
  const skipped: SkippedFile[] = []
  const toFetch: (DiffEntry | CompareFile)[] = []

  for (const file of entries) {
    const reason = shouldSkip(file, fileFilter)
    if (reason) {
      skipped.push({ filename: file.filename, reason })
    } else {
      toFetch.push(file)
    }
  }

  core.info(
    `Files: ${entries.length} total, ${toFetch.length} to review, ${skipped.length} skipped`
  )

  const tasks = toFetch.map((file) => async (): Promise<ReviewFile> => {
    const content = await getFileContent(
      octokit,
      owner,
      repo,
      file.filename,
      headSha,
      file.sha ?? ''
    )
    return {
      filename: file.filename,
      status: toReviewFileStatus(file.status),
      patch: file.patch || '',
      content
    }
  })

  const files = await limitConcurrency(tasks, CONCURRENCY_LIMIT)
  return { files, skipped }
}

// Full-PR review: every file changed between the base branch and the PR head.
export async function fetchFilesForReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string,
  fileFilter?: string
): Promise<FetchResult> {
  const allFiles = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100
  })
  return buildReviewFiles(octokit, owner, repo, headSha, fileFilter, allFiles)
}

// Incremental review: only the files changed between the last-reviewed commit and the
// PR head, using GitHub's compare API (base...head three-dot semantics).
export async function fetchFilesForCompare(
  octokit: Octokit,
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  fileFilter?: string
): Promise<CompareResult> {
  const { data } = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base: baseSha,
    head: headSha
  })
  const entries = data.files ?? []
  const result = await buildReviewFiles(
    octokit,
    owner,
    repo,
    headSha,
    fileFilter,
    entries
  )
  return {
    ...result,
    status: data.status,
    incremental: data.status === 'ahead'
  }
}

// The head SHA of the most recent review this action posted on the PR. Every review we
// create is stamped by GitHub with the commit it was made against, so this is our record
// of "what did we last review" without any server-side state. Returns null if we have
// never reviewed this PR (first run / freshly enabled).
export async function getLastReviewedSha(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string | null> {
  const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100
  })

  // listReviews returns oldest-first; walk backwards to find our latest review.
  for (let i = reviews.length - 1; i >= 0; i--) {
    const review = reviews[i]
    if (review.user?.login === BOT_LOGIN && review.commit_id) {
      return review.commit_id
    }
  }
  return null
}

async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
  sha: string
): Promise<string> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
      mediaType: { format: 'raw' }
    })
    if (typeof data === 'string') return data
    return ''
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    core.warning(`getContent failed for ${path}: ${msg}, trying blob API`)
    return getFileContentViaBlob(octokit, owner, repo, sha)
  }
}

async function getFileContentViaBlob(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string
): Promise<string> {
  const { data } = await octokit.rest.git.getBlob({
    owner,
    repo,
    file_sha: sha
  })
  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf-8')
  }
  return data.content
}

export function mapCommentsForReview(
  comments: ReviewComment[]
): CreateReviewComment[] {
  return comments.map((c) => {
    const comment: CreateReviewComment = {
      path: c.path,
      body: `${COMMENT_MARKER}\n${c.body}`,
      side: 'RIGHT',
      line: c.endLine > 0 ? c.endLine : c.startLine
    }
    if (c.endLine > 0 && c.endLine !== c.startLine) {
      comment.start_line = c.startLine
    }
    return comment
  })
}

export function buildReviewBody(response: ReviewResponse): string | undefined {
  let body = response.summary || ''
  if (response.fileErrors.length > 0) {
    const errorList = response.fileErrors
      .map((e) => `- \`${e.filename}\`: ${e.error}`)
      .join('\n')
    body += `\n\nSome files could not be reviewed:\n${errorList}`
  }
  return body || undefined
}

// Anchors (`path:line`) of inline comments this action has already posted on the PR. Used
// to avoid re-posting a comment on a line we have commented on before, e.g. when a later
// push re-touches a region the bot already flagged.
async function getPostedCommentAnchors(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<Set<string>> {
  const comments = await octokit.paginate(
    octokit.rest.pulls.listReviewComments,
    {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    }
  )

  const anchors = new Set<string>()
  for (const c of comments) {
    const isOurs =
      c.user?.login === BOT_LOGIN || c.body.includes(COMMENT_MARKER)
    if (isOurs && c.line != null) {
      anchors.add(`${c.path}:${c.line}`)
    }
  }
  return anchors
}

export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  response: ReviewResponse
): Promise<void> {
  const existing = await getPostedCommentAnchors(
    octokit,
    owner,
    repo,
    pullNumber
  )
  const comments = mapCommentsForReview(response.comments).filter(
    (c) => !existing.has(`${c.path}:${c.line}`)
  )

  // Always post a review so it records a commit_id marker (see getLastReviewedSha). When
  // there is nothing to say, GitHub rejects an empty COMMENT review, so post a short body.
  let body = buildReviewBody(response)
  if (comments.length === 0 && !body) {
    body = `${COMMENT_MARKER}\n${NO_ISSUES_MESSAGE}`
  }

  await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: pullNumber,
    event: 'COMMENT',
    body,
    comments
  })

  core.info(`Posted review with ${comments.length} inline comment(s)`)
}

export async function getCommentThread(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commentId: number
): Promise<{ thread: ThreadComment[]; path: string }> {
  const allComments = await octokit.paginate(
    octokit.rest.pulls.listReviewComments,
    {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    }
  )

  const triggerComment = allComments.find((c) => c.id === commentId)
  if (!triggerComment) {
    throw new Error(`Comment ${commentId} not found`)
  }

  const rootId = triggerComment.in_reply_to_id || triggerComment.id
  const threadComments = allComments
    .filter((c) => c.id === rootId || c.in_reply_to_id === rootId)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

  const thread: ThreadComment[] = threadComments.map((c) => ({
    id: c.id,
    user: c.user?.login || '',
    body: c.body,
    createdAt: c.created_at
  }))

  return { thread, path: triggerComment.path }
}

export async function getFileForComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  path: string,
  ref: string
): Promise<ReviewFile | null> {
  const allFiles = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100
  })

  const match = allFiles.find((f) => f.filename === path)
  if (!match) {
    core.warning(
      `File ${path} not found in PR #${pullNumber} diff, skipping reply`
    )
    return null
  }

  const content = await getFileContent(
    octokit,
    owner,
    repo,
    path,
    ref,
    match.sha ?? ''
  )
  return {
    filename: path,
    status: toReviewFileStatus(match.status),
    patch: match.patch || '',
    content
  }
}

export async function postReply(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  commentId: number,
  body: string
): Promise<void> {
  await octokit.rest.pulls.createReplyForReviewComment({
    owner,
    repo,
    pull_number: pullNumber,
    comment_id: commentId,
    body: `${COMMENT_MARKER}\n${body}`
  })
  core.info(`Posted reply to comment ${commentId}`)
}
