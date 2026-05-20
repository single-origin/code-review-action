import { BOT_LOGIN, COMMENT_MARKER } from './constants.js'
import { ThreadComment } from './types.js'

export interface CommentPayload {
  user?: { login?: string }
  body?: string
}

export type SkipReason =
  | 'bot_author'
  | 'marked_comment'
  | 'no_bot_in_thread'
  | null

export function shouldSkipComment(
  comment: CommentPayload,
  thread?: ThreadComment[]
): SkipReason {
  if (comment.user?.login === BOT_LOGIN) {
    return 'bot_author'
  }

  if (
    typeof comment.body === 'string' &&
    comment.body.includes(COMMENT_MARKER)
  ) {
    return 'marked_comment'
  }

  if (thread) {
    const hasOurComment = thread.some(
      (t) => t.user === BOT_LOGIN || t.body.includes(COMMENT_MARKER)
    )
    if (!hasOurComment) {
      return 'no_bot_in_thread'
    }
  }

  return null
}
