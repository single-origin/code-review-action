import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs/promises'
import { PullRequestReviewCommentCreatedEvent } from '@octokit/webhooks-types'
import { callReview, callReply } from './backend.js'
import { shouldSkipComment } from './loop-prevention.js'
import {
  fetchFilesForReview,
  fetchFilesForCompare,
  getLastReviewedSha,
  postReview,
  getCommentThread,
  getFileForComment,
  postReply,
  FetchResult
} from './github.js'
import {
  ActionInputs,
  CodeReviewStatus,
  ReviewRequest,
  ReviewScope,
  ReplyToReviewThreadRequest
} from './types.js'

function getInputs(): ActionInputs {
  const apiKey = core.getInput('api-key', { required: true })
  core.setSecret(apiKey)

  return {
    backendUrl: core.getInput('backend-url', { required: true }),
    apiKey,
    githubToken: core.getInput('github-token', { required: true }),
    timeoutSeconds: parseInt(core.getInput('timeout-seconds') || '300', 10),
    fileFilter: core.getInput('file-filter'),
    uploadArtifact: core.getInput('upload-artifact') === 'true'
  }
}

async function handlePullRequest(inputs: ActionInputs): Promise<void> {
  const octokit = github.getOctokit(inputs.githubToken)
  const { owner, repo } = github.context.repo
  const pr = github.context.payload.pull_request
  if (!pr) {
    core.setFailed('No pull_request in event payload')
    return
  }

  const pullNumber: number = pr.number
  const headSha: string = pr.head.sha
  const fullName = `${owner}/${repo}`
  const isSync = github.context.payload.action === 'synchronize'

  // On a subsequent push (synchronize) review only what changed since our last review;
  // otherwise (opened/reopened, or no prior review) review the full PR diff.
  let scope = ReviewScope.FULL
  let result: FetchResult

  const sinceSha = isSync
    ? await getLastReviewedSha(octokit, owner, repo, pullNumber)
    : null

  if (sinceSha) {
    const compare = await fetchFilesForCompare(
      octokit,
      owner,
      repo,
      sinceSha,
      headSha,
      inputs.fileFilter
    )
    if (compare.incremental) {
      scope = ReviewScope.INCREMENTAL
      result = compare
      core.info(
        `Incremental review of PR #${pullNumber} since ${sinceSha} (${headSha})`
      )
    } else {
      core.info(
        `Compare status '${compare.status}' is not a clean delta; ` +
          `full review of PR #${pullNumber} (${headSha})`
      )
      result = await fetchFilesForReview(
        octokit,
        owner,
        repo,
        pullNumber,
        headSha,
        inputs.fileFilter
      )
    }
  } else {
    if (isSync) {
      core.info(
        `No prior review found; full review of PR #${pullNumber} (${headSha})`
      )
    } else {
      core.info(`Reviewing PR #${pullNumber} (${headSha})`)
    }
    result = await fetchFilesForReview(
      octokit,
      owner,
      repo,
      pullNumber,
      headSha,
      inputs.fileFilter
    )
  }

  const { files, skipped } = result

  if (skipped.length > 0) {
    core.info(`Skipped ${skipped.length} file(s)`)
  }

  if (files.length === 0) {
    core.info('No reviewable files found')
    return
  }

  const request: ReviewRequest = {
    repository: { fullName },
    pullRequest: {
      number: pullNumber,
      scope,
      author: pr.user?.login ?? ''
    },
    files
  }

  const response = await callReview(inputs, request)

  if (inputs.uploadArtifact) {
    const artifactPath = '/tmp/code-review-result.json'
    await fs.writeFile(artifactPath, JSON.stringify(response, null, 2))
    core.info(`Review result written to ${artifactPath}`)
    core.setOutput('artifact-path', artifactPath)
  }

  if (
    response.status === CodeReviewStatus.FAILED &&
    response.comments.length === 0
  ) {
    core.setFailed(`Review failed: ${response.error}`)
    return
  }

  // Always post a review — even with no comments — so it records a commit_id marker that
  // getLastReviewedSha reads to bound the next incremental review.
  await postReview(octokit, owner, repo, pullNumber, response)

  if (response.fileErrors.length > 0) {
    for (const e of response.fileErrors) {
      core.warning(`${e.filename}: ${e.error}`)
    }
  }
}

async function handleReviewComment(inputs: ActionInputs): Promise<void> {
  const octokit = github.getOctokit(inputs.githubToken)
  const { owner, repo } = github.context.repo
  const payload = github.context.payload as PullRequestReviewCommentCreatedEvent

  const { comment, pull_request: pr } = payload

  const earlySkip = shouldSkipComment(comment)
  if (earlySkip) {
    core.info(`Skipping: ${earlySkip}`)
    return
  }

  const commentId: number = comment.id
  const pullNumber: number = pr.number
  const headSha: string = pr.head.sha
  const fullName = `${owner}/${repo}`

  core.info(`Handling reply on PR #${pullNumber}, comment ${commentId}`)

  const { thread, path } = await getCommentThread(
    octokit,
    owner,
    repo,
    pullNumber,
    commentId
  )

  const threadSkip = shouldSkipComment(comment, thread)
  if (threadSkip) {
    core.info(`Skipping: ${threadSkip}`)
    return
  }

  const file = await getFileForComment(
    octokit,
    owner,
    repo,
    pullNumber,
    path,
    headSha
  )
  if (!file) {
    core.info('Skipping: file not found, likely deleted')
    return
  }

  const request: ReplyToReviewThreadRequest = {
    repository: { fullName },
    pullRequest: {
      number: pullNumber,
      scope: ReviewScope.FULL,
      author: pr.user?.login ?? ''
    },
    file,
    thread
  }

  const response = await callReply(inputs, request)

  if (response.status === CodeReviewStatus.FAILED) {
    core.setFailed(`Reply failed: ${response.body}`)
    return
  }

  if (response.body) {
    const rootId = thread.length > 0 ? thread[0].id : commentId
    await postReply(octokit, owner, repo, pullNumber, rootId, response.body)
  }
}

export async function run(): Promise<void> {
  try {
    const inputs = getInputs()
    const eventName = github.context.eventName

    switch (eventName) {
      case 'pull_request':
        await handlePullRequest(inputs)
        break
      case 'pull_request_review_comment':
        await handleReviewComment(inputs)
        break
      default:
        core.info(`Unsupported event: ${eventName}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    core.setFailed(message)
  }
}
