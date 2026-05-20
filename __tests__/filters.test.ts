import { describe, expect, it } from '@jest/globals'
import { isBinary, isGenerated, shouldSkip } from '../src/filters'

describe('isBinary', () => {
  it('detects binary files (no patch, zero additions/deletions)', () => {
    expect(
      isBinary({
        filename: 'logo.png',
        status: 'added',
        additions: 0,
        deletions: 0
      })
    ).toBe(true)
  })

  it('returns false when patch exists', () => {
    expect(
      isBinary({
        filename: 'readme.md',
        status: 'modified',
        patch: '@@ -1 +1 @@',
        additions: 1,
        deletions: 1
      })
    ).toBe(false)
  })

  it('returns false when additions > 0', () => {
    expect(
      isBinary({
        filename: 'data.csv',
        status: 'added',
        additions: 5,
        deletions: 0
      })
    ).toBe(false)
  })
})

describe('isGenerated', () => {
  it.each([
    ['vendor/lib/foo.go', true],
    ['src/vendor/lib.js', true],
    ['node_modules/@actions/core/index.js', true],
    ['assets/app.min.js', true],
    ['proto/service.pb.go', true],
    ['package-lock.json', true],
    ['yarn.lock', true],
    ['go.sum', true],
    ['dist/index.js', true],
    ['src/main.ts', false],
    ['lib/utils.py', false],
    ['app.js', false]
  ])('%s → %s', (filename, expected) => {
    expect(isGenerated(filename as string)).toBe(expected)
  })
})

describe('shouldSkip', () => {
  it('returns "binary" for binary files', () => {
    expect(
      shouldSkip({
        filename: 'image.png',
        status: 'added',
        additions: 0,
        deletions: 0
      })
    ).toBe('binary')
  })

  it('returns "removed" for deleted files', () => {
    expect(
      shouldSkip({
        filename: 'old.ts',
        status: 'removed',
        patch: '@@ -1,5 +0,0 @@',
        additions: 0,
        deletions: 5
      })
    ).toBe('removed')
  })

  it('returns "generated" for generated files', () => {
    expect(
      shouldSkip({
        filename: 'package-lock.json',
        status: 'modified',
        patch: '@@ ...',
        additions: 100,
        deletions: 50
      })
    ).toBe('generated')
  })

  it('returns null for reviewable files', () => {
    expect(
      shouldSkip({
        filename: 'src/handler.ts',
        status: 'modified',
        patch: '@@ -1 +1 @@',
        additions: 3,
        deletions: 1
      })
    ).toBeNull()
  })
})
