import { v4 as uuidv4 } from 'uuid'
import * as core from '@actions/core'
import {
  ActionInputs,
  ReviewRequest,
  ReviewResponse,
  ReplyToReviewThreadRequest,
  ReplyToReviewThreadResponse,
  CodeReviewStatus
} from './types.js'

async function callBackend<TReq, TRes>(
  inputs: ActionInputs,
  path: string,
  request: TReq
): Promise<TRes> {
  const url = `${inputs.backendUrl.replace(/\/+$/, '')}${path}`
  const requestId = uuidv4()

  core.info(`POST ${url} (X-Request-ID: ${requestId})`)

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    inputs.timeoutSeconds * 1000
  )

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${inputs.apiKey}`,
        'X-Request-ID': requestId
      },
      body: JSON.stringify(request),
      signal: controller.signal
    })

    const body = await response.text()

    if (!response.ok) {
      throw new Error(
        `Backend returned ${response.status}: ${body.slice(0, 500)}`
      )
    }

    return JSON.parse(body) as TRes
  } finally {
    clearTimeout(timeout)
  }
}

export async function callReview(
  inputs: ActionInputs,
  request: ReviewRequest
): Promise<ReviewResponse> {
  try {
    return await callBackend<ReviewRequest, ReviewResponse>(
      inputs,
      '/api/v1/code-review/review',
      request
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: CodeReviewStatus.FAILED,
      summary: '',
      comments: [],
      fileErrors: [],
      error: message
    }
  }
}

export async function callReply(
  inputs: ActionInputs,
  request: ReplyToReviewThreadRequest
): Promise<ReplyToReviewThreadResponse> {
  try {
    return await callBackend<
      ReplyToReviewThreadRequest,
      ReplyToReviewThreadResponse
    >(inputs, '/api/v1/code-review/reply', request)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      status: CodeReviewStatus.FAILED,
      body: message
    }
  }
}
