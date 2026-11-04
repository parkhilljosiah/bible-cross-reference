import assert from 'node:assert/strict'
import { test } from 'node:test'
import { carriesView, shouldShowWelcome } from '../src/welcomeRule.ts'

test('a plain visit is not a shared view', () => {
  assert.equal(carriesView(''), false)
  assert.equal(carriesView('?'), false)
})

test('a cache-busting or unrelated parameter is not a shared view', () => {
  assert.equal(carriesView('?x=abc123'), false)
  assert.equal(carriesView('?utm_source=news'), false)
})

test('each view parameter marks a shared view', () => {
  for (const p of ['between', 'and', 'votes', 'zoom', 'src', 'sel', 'tr', 'cmp', 'q', 'qm']) {
    assert.equal(carriesView(`?${p}=1`), true, p)
  }
  assert.equal(carriesView('?x=1&sel=1000-1010'), true)
})

test('first-time visitors on the plain site see the welcome window', () => {
  assert.equal(shouldShowWelcome('', false), true)
  assert.equal(shouldShowWelcome('?x=1', false), true)
})

test('returning visitors and recipients of shared links do not', () => {
  assert.equal(shouldShowWelcome('', true), false)
  assert.equal(shouldShowWelcome('?sel=1000-1010', false), false)
  assert.equal(shouldShowWelcome('?q=son+of+man', false), false)
})
