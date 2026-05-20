import * as core from '@actions/core'
import * as github from '@actions/github'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { COMMENT_MARKER, CONCURRENCY_LIMIT } from './constants.js'
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

interface FetchResult {
  files: ReviewFile[]
  skipped: SkippedFile[]
}

function toReviewFileStatus(status: DiffEntry['status']): ReviewFileStatus {
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

export async function fetchFilesForReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  headSha: string
): Promise<FetchResult> {
  const allFiles = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100
  })

  const skipped: SkippedFile[] = []
  const toFetch: typeof allFiles = []

  for (const file of allFiles) {
    const reason = shouldSkip(file)
    if (reason) {
      skipped.push({ filename: file.filename, reason })
    } else {
      toFetch.push(file)
    }
  }

  core.info(
    `Files: ${allFiles.length} total, ${toFetch.length} to review, ${skipped.length} skipped`
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

export async function postReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  response: ReviewResponse
): Promise<void> {
  const comments = mapCommentsForReview(response.comments)
  const body = buildReviewBody(response)

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
