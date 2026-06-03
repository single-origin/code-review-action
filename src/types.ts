export enum CodeReviewStatus {
  UNSPECIFIED = 'CODE_REVIEW_STATUS_UNSPECIFIED',
  COMPLETED = 'CODE_REVIEW_STATUS_COMPLETED',
  FAILED = 'CODE_REVIEW_STATUS_FAILED'
}

export enum ReviewFileStatus {
  UNSPECIFIED = 'REVIEW_FILE_STATUS_UNSPECIFIED',
  ADDED = 'REVIEW_FILE_STATUS_ADDED',
  MODIFIED = 'REVIEW_FILE_STATUS_MODIFIED',
  REMOVED = 'REVIEW_FILE_STATUS_REMOVED',
  RENAMED = 'REVIEW_FILE_STATUS_RENAMED'
}

export enum ReviewScope {
  UNSPECIFIED = 'REVIEW_SCOPE_UNSPECIFIED',
  FULL = 'REVIEW_SCOPE_FULL',
  INCREMENTAL = 'REVIEW_SCOPE_INCREMENTAL'
}

export interface Repository {
  fullName: string
}

export interface PullRequest {
  number: number
  scope: ReviewScope
}

export interface ReviewFile {
  filename: string
  status: ReviewFileStatus
  patch: string
  content: string
}

export interface ReviewComment {
  path: string
  startLine: number
  endLine: number
  body: string
}

export interface FileError {
  filename: string
  error: string
}

export interface ThreadComment {
  id: number
  user: string
  body: string
  createdAt: string
}

export interface ReviewRequest {
  repository: Repository
  pullRequest: PullRequest
  files: ReviewFile[]
}

export interface ReviewResponse {
  status: CodeReviewStatus
  summary: string
  comments: ReviewComment[]
  fileErrors: FileError[]
  error: string
}

export interface ReplyToReviewThreadRequest {
  repository: Repository
  pullRequest: PullRequest
  file: ReviewFile
  thread: ThreadComment[]
}

export interface ReplyToReviewThreadResponse {
  status: CodeReviewStatus
  body: string
}

export interface SkippedFile {
  filename: string
  reason: string
}

export interface ActionInputs {
  backendUrl: string
  apiKey: string
  githubToken: string
  timeoutSeconds: number
  fileFilter: string
  postComment: boolean
  uploadArtifact: boolean
}
