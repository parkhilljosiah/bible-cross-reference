import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildAll, sections } from '../scripts/build-checklists.mjs'

const md = readFileSync(new URL('../TESTING.md', import.meta.url), 'utf8')
const boxes = (s: string) => (s.match(/^\s*- \[ \]/gm) ?? []).length
const built = Object.fromEntries(buildAll(md).map((t: { file: string; content: string }) => [t.file, t.content]))

test('the issue templates are up to date with TESTING.md', () => {
  for (const [file, expected] of Object.entries(built)) {
    const actual = readFileSync(new URL(`../.github/ISSUE_TEMPLATE/${file}`, import.meta.url), 'utf8')
    assert.equal(actual, expected, `${file} is out of date: run "npm run checklists" and commit the result`)
  }
})

test('every template starts with valid issue-template front matter', () => {
  for (const [file, content] of Object.entries(built)) {
    const lines = content.split('\n')
    assert.equal(lines[0], '---', file)
    const end = lines.indexOf('---', 1)
    assert.ok(end > 0, `${file}: front matter is not closed`)
    const head = lines.slice(1, end).join('\n')
    assert.match(head, /^name: .+/m, file)
    assert.match(head, /^about: .+/m, file)
  }
})

test('no checklist item is lost: each template carries all the boxes of its sections', () => {
  const s = sections(md)
  const count = (prefix: string) => boxes([...s].find(([h]) => h.startsWith(prefix))![1])
  const smoke = count('0. ') + count('1. ') + count('2. ')
  assert.equal(boxes(built['release-check-smoke.md']), smoke)
  assert.equal(boxes(built['release-check-full.md']), smoke + count('3. '))
  assert.equal(boxes(built['release-check-data.md']), count('0. ') + count('4. '))
  assert.ok(smoke >= 15, 'the smoke test should have real content')
})

test('templates carry the golden links, and the known-behavior list where it matters', () => {
  for (const file of ['release-check-smoke.md', 'release-check-full.md', 'release-check-data.md']) {
    assert.match(built[file], /## Golden links/, file)
    assert.match(built[file], /133,357 of 301,559/, file)
  }
  assert.match(built['release-check-smoke.md'], /Known behavior \(not bugs\)/)
  assert.doesNotMatch(built['release-check-data.md'], /Known behavior/)
})

test('golden links are clickable in the issue', () => {
  for (const content of Object.values(built)) {
    assert.match(content, /\| \[`\/\?sel=John\.3\.16`\]\(https:\/\/parkhilljosiah\.github\.io\/bible-cross-reference\/\?sel=John\.3\.16\) \|/)
    assert.match(content, /\| \[`\/`\]\(https:\/\/parkhilljosiah\.github\.io\/bible-cross-reference\/\) \|/)
  }
})

test('the manual-only sections are not copied into the templates', () => {
  for (const content of Object.values(built)) {
    assert.doesNotMatch(content, /## 6\. Test log/)
    assert.doesNotMatch(content, /## Keeping this list current/)
  }
})
