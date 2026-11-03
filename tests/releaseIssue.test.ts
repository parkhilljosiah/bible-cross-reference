import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildIssue, chooseKind, decide, onlyDocsChanged, TEMPLATES } from '../scripts/create-release-issue.mjs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const smoke = read(`.github/ISSUE_TEMPLATE/${TEMPLATES.smoke}`)
const boxes = (s: string) => (s.match(/^\s*- \[ \]/gm) ?? []).length
const base = { sha: 'b6b73e2b6a4e0d6f306c91c69d481aee0c7c2268', repoUrl: 'https://github.com/o/r', runUrl: 'https://github.com/o/r/actions/runs/123' }

test('which checklist: by hand, by commit tag, else smoke', () => {
  assert.equal(chooseKind('Add a feature', ''), 'smoke')
  assert.equal(chooseKind('Rework search [full]', ''), 'full')
  assert.equal(chooseKind('Rebuild the data [DATA]', ''), 'data')
  assert.equal(chooseKind('Add a feature [full]', 'data'), 'data', 'a choice made by hand wins')
  assert.equal(chooseKind('x', 'nonsense'), 'smoke')
})

test('documentation and test changes alone do not change the site', () => {
  assert.equal(onlyDocsChanged(['README.md', 'TESTING.md']), true)
  assert.equal(onlyDocsChanged(['tests/a.test.ts', '.github/ISSUE_TEMPLATE/x.md']), true)
  assert.equal(onlyDocsChanged(['README.md', 'src/App.tsx']), false)
  assert.equal(onlyDocsChanged(['public/data/text/KJV/Ps.json']), false)
  assert.equal(onlyDocsChanged(['.github/workflows/deploy.yml']), false)
  assert.equal(onlyDocsChanged(['package.json']), false)
  assert.equal(onlyDocsChanged([]), false, 'unknown changes are not assumed to be harmless')
})

test('when an issue is opened', () => {
  assert.equal(decide({ message: 'Fix search', files: ['src/App.tsx'], manual: false }).create, true)
  assert.equal(decide({ message: 'Fix wording', files: ['TESTING.md'], manual: false }).create, false)
  assert.equal(decide({ message: 'Fix wording [issue]', files: ['TESTING.md'], manual: false }).create, true, '[issue] forces one')
  assert.equal(decide({ message: 'Fix search [no-issue]', files: ['src/App.tsx'], manual: false }).create, false, '[no-issue] suppresses it')
  assert.equal(decide({ message: 'Docs only', files: ['README.md'], manual: true }).create, true, 'a manual run always opens one')
  assert.equal(decide({ message: 'Anything', files: [], manual: false }).create, true, 'no file list: assume the site changed')
  assert.ok(decide({ message: 'x', files: ['README.md'], manual: false }).reason.length > 10, 'the reason is logged')
})

test('the issue is the template, filled in', () => {
  const { title, body } = buildIssue({ ...base, template: smoke, kind: 'smoke', subject: 'Fix search' })
  assert.equal(title, 'Release check: b6b73e2 Fix search')
  assert.doesNotMatch(body, /^---\nname:/, 'the template front matter is removed')
  assert.match(body, /\[`b6b73e2`\]\(https:\/\/github\.com\/o\/r\/commit\/b6b73e2b6a4e0d6f306c91c69d481aee0c7c2268\) Fix search/)
  assert.match(body, /Deploy run \(Actions link\):\*\* https:\/\/github\.com\/o\/r\/actions\/runs\/123 \(succeeded\)/)
  assert.match(body, /\?x=b6b73e2/, 'a cache-bypassing link to this build')
  assert.equal(boxes(body), boxes(smoke), 'every checkbox of the template is kept')
  assert.match(body, /## Golden links/)
})

test('the full and data checklists are labelled in the title', () => {
  const full = read(`.github/ISSUE_TEMPLATE/${TEMPLATES.full}`)
  assert.equal(buildIssue({ ...base, template: full, kind: 'full', subject: 'Big change' }).title, 'Release check (full): b6b73e2 Big change')
  const data = read(`.github/ISSUE_TEMPLATE/${TEMPLATES.data}`)
  assert.match(buildIssue({ ...base, template: data, kind: 'data', subject: 'Rebuild' }).title, /^Release check \(data\): /)
})

test('odd commit messages cannot break the issue', () => {
  const nasty = 'Costs $& and $1 and `ticks` and [brackets](x)'
  const { body, title } = buildIssue({ ...base, template: smoke, kind: 'smoke', subject: nasty })
  assert.ok(body.includes(`) ${nasty}`), 'the subject appears exactly as written')
  assert.ok(title.startsWith('Release check: b6b73e2 Costs'))
  assert.ok(buildIssue({ ...base, template: smoke, kind: 'smoke', subject: 'x'.repeat(300) }).title.length <= 100, 'titles are capped')
})

test('a template without the fill-in lines is reported, not silently emitted', () => {
  assert.throws(() => buildIssue({ ...base, template: '---\nname: x\n---\njust text', kind: 'smoke', subject: 's' }), /no "Release/)
})

test('the workflow opens the issue only after a successful deploy, with permission to do so', () => {
  const yml = read('.github/workflows/deploy.yml')
  assert.match(yml, /release-check:\n\s+needs: deploy/, 'the job waits for the deploy')
  assert.match(yml, /issues: write/)
  assert.match(yml, /node scripts\/create-release-issue\.mjs/)
  assert.match(yml, /fetch-depth: 2/, 'it needs the previous commit to see which files changed')
  assert.match(yml, /options: \[smoke, full, data\]/)
})
