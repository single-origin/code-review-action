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

  it('returns "filtered" when file does not match inclusion filter', () => {
    expect(
      shouldSkip(
        {
          filename: 'src/handler.ts',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 3,
          deletions: 1
        },
        '**/*.sql'
      )
    ).toBe('filtered')
  })

  it('returns null when file matches inclusion filter', () => {
    expect(
      shouldSkip(
        {
          filename: 'migrations/001_create_users.sql',
          status: 'added',
          patch: '@@ -0,0 +1,5 @@',
          additions: 5,
          deletions: 0
        },
        '**/*.sql'
      )
    ).toBeNull()
  })

  it('returns null when no inclusion filter is provided', () => {
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

  it('filters everything when file-filter is empty string', () => {
    expect(
      shouldSkip(
        {
          filename: 'migrations/001_create_users.sql',
          status: 'added',
          patch: '@@ -0,0 +1,5 @@',
          additions: 5,
          deletions: 0
        },
        ''
      )
    ).toBe('filtered')
  })

  it('matches files in a specific directory with glob', () => {
    const filter = 'db/migrations/*'
    expect(
      shouldSkip(
        {
          filename: 'db/migrations/001_create_users.sql',
          status: 'added',
          patch: '@@ -0,0 +1,5 @@',
          additions: 5,
          deletions: 0
        },
        filter
      )
    ).toBeNull()
    expect(
      shouldSkip(
        {
          filename: 'src/handler.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 3,
          deletions: 1
        },
        filter
      )
    ).toBe('filtered')
  })

  it('matches nested directory paths with glob', () => {
    const filter = 'src/db/*.sql'
    expect(
      shouldSkip(
        {
          filename: 'src/db/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBeNull()
    expect(
      shouldSkip(
        {
          filename: 'other/db/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBe('filtered')
  })

  it('matches glob directory paths with glob', () => {
    const filter = 'src/**/*.sql'
    expect(
      shouldSkip(
        {
          filename: 'src/db/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBeNull()
    expect(
      shouldSkip(
        {
          filename: 'src/db/migration/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBeNull()
    expect(
      shouldSkip(
        {
          filename: 'other/db/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBe('filtered')
  })
  it('matches glob single directory paths with glob', () => {
    const filter = 'src/*/*.sql'
    expect(
      shouldSkip(
        {
          filename: 'src/db/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBeNull()
    expect(
      shouldSkip(
        {
          filename: 'src/db/migration/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBe('filtered')
    expect(
      shouldSkip(
        {
          filename: 'other/db/queries.sql',
          status: 'modified',
          patch: '@@ -1 +1 @@',
          additions: 1,
          deletions: 1
        },
        filter
      )
    ).toBe('filtered')
  })

  it('matches multiple extensions with brace expansion', () => {
    const filter = '**/*.{sql,py}'
    const file = (filename: string) => ({
      filename,
      status: 'modified' as const,
      patch: '@@ -1 +1 @@',
      additions: 1,
      deletions: 1
    })
    expect(shouldSkip(file('db/query.sql'), filter)).toBeNull()
    expect(shouldSkip(file('scripts/run.py'), filter)).toBeNull()
    expect(shouldSkip(file('src/app.ts'), filter)).toBe('filtered')
  })
})
