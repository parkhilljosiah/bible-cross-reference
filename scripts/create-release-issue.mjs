// After a successful deploy, opens a "Release check" issue pre-filled from the issue templates in .github/ISSUE_TEMPLATE/ (which are
// generated from TESTING.md). Run by the `release-check` job in .github/workflows/deploy.yml; try it locally with:
//   node scripts/create-release-issue.mjs --dry-run
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://parkhilljosiah.github.io/bible-cross-reference/'
export const LABEL = 'release-check'
export const TEMPLATES = { smoke: 'release-check-smoke.md', full: 'release-check-full.md', data: 'release-check-data.md' }

/** Which checklist: chosen by hand when the workflow is run manually, else "[full]" / "[data]" in the commit message, else smoke. */
export function chooseKind(message, input) {
  if (input && TEMPLATES[input]) return input
  const tag = message.match(/\[(full|data)\]/i)
  return tag ? tag[1].toLowerCase() : 'smoke'
}

/** True when every changed file is documentation or tests, which cannot change what visitors see. Unknown (no files) counts as "no". */
export function onlyDocsChanged(files) {
  return files.length > 0 && files.every((f) => /\.md$/i.test(f) || f.startsWith('tests/') || f.startsWith('.github/ISSUE_TEMPLATE/'))
}

/** Whether to open an issue for this deploy, and why (the reason is logged). */
export function decide({ message, files, manual }) {
  if (manual) return { create: true, reason: 'the workflow was run by hand' }
  if (/\[no-issue\]/i.test(message)) return { create: false, reason: 'the commit message has [no-issue]' }
  if (/\[issue\]/i.test(message)) return { create: true, reason: 'the commit message has [issue]' }
  if (onlyDocsChanged(files)) {
    return { create: false, reason: 'only documentation or tests changed (put [issue] in the commit message to get one anyway)' }
  }
  return { create: true, reason: 'the site may have changed' }
}

/** The issue's title and body: the template without its front matter, with the release and deploy lines filled in. */
export function buildIssue({ template, kind, sha, subject, repoUrl, runUrl }) {
  const short = sha.slice(0, 7)
  let body = template.replace(/^---\n[\s\S]*?\n---\n/, '')
  const fill = (label, value) => {
    const line = new RegExp(`^(- \\*\\*${label}:\\*\\*) *$`, 'm')
    if (!line.test(body)) throw new Error(`the issue template has no "${label}" line to fill in`)
    // A function, not a string, so a "$&" or "$1" in a commit message can't be read as a replacement pattern.
    body = body.replace(line, (_, start) => `${start} ${value}`)
  }
  fill('Release \\(commit or date\\)', `[\`${short}\`](${repoUrl}/commit/${sha}) ${subject}`)
  fill('Deploy run \\(Actions link\\)', `${runUrl} (succeeded)`)
  body = body.replace(/^(- \*\*Deploy run[^\n]*\n)/m, (_, line) => `${line}- **Open the new build (bypasses the cache):** ${SITE}?x=${short}\n`)
  const suffix = kind === 'smoke' ? '' : ` (${kind})`
  return { title: `Release check${suffix}: ${short} ${subject}`.slice(0, 100), body }
}

// Run directly: decide, build, and open the issue (or just print it with --dry-run).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env
  const dry = process.argv.includes('--dry-run')
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  const gh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input })

  const sha = env.GITHUB_SHA || git('rev-parse', 'HEAD')
  const message = git('log', '-1', '--pretty=%B', sha)
  const subject = git('log', '-1', '--pretty=%s', sha)
  let files = []
  try {
    files = git('diff', '--name-only', `${sha}~1`, sha).split('\n').filter(Boolean)
  } catch {
    /* no parent commit available: treat the change as unknown, which opens an issue */
  }
  const repo = env.GITHUB_REPOSITORY || 'parkhilljosiah/bible-cross-reference'
  const repoUrl = `${env.GITHUB_SERVER_URL || 'https://github.com'}/${repo}`
  const runUrl = env.GITHUB_RUN_ID ? `${repoUrl}/actions/runs/${env.GITHUB_RUN_ID}` : `${repoUrl}/actions`

  const decision = decide({ message, files, manual: env.GITHUB_EVENT_NAME === 'workflow_dispatch' })
  console.log(`Release-check issue: ${decision.create ? 'opening one' : 'skipping'} because ${decision.reason}.`)
  if (decision.create) {
    const kind = chooseKind(message, env.CHECKLIST_INPUT)
    const template = readFileSync(join(ROOT, '.github', 'ISSUE_TEMPLATE', TEMPLATES[kind]), 'utf8')
    const { title, body } = buildIssue({ template, kind, sha, subject, repoUrl, runUrl })
    if (dry) {
      console.log(`\nTITLE: ${title}\n\n${body}`)
    } else {
      try {
        gh(['label', 'create', LABEL, '--color', '1f6feb', '--description', 'Checklist to run after a deployment'])
      } catch {
        /* the label already exists */
      }
      const short = sha.slice(0, 7)
      const existing = JSON.parse(gh(['issue', 'list', '--state', 'all', '--label', LABEL, '--limit', '100', '--json', 'title']))
      if (existing.some((i) => i.title.includes(` ${short} `) || i.title.endsWith(` ${short}`))) {
        console.log(`An issue for ${short} already exists; not opening another.`)
      } else {
        console.log(gh(['issue', 'create', '--title', title, '--body-file', '-', '--label', LABEL], body).trim())
      }
    }
  }
}
