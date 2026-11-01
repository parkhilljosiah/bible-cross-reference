import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Lru } from '../src/lruCache.ts'

test('keeps the most recent entries and evicts the oldest', () => {
  const evicted: string[] = []
  const c = new Lru<number>(2, (k) => evicted.push(k))
  c.set('a', 1)
  c.set('b', 2)
  assert.deepEqual(evicted, [])
  c.set('c', 3)
  assert.deepEqual(evicted, ['a'])
  assert.equal(c.get('a'), undefined)
  assert.equal(c.get('b'), 2)
  assert.equal(c.get('c'), 3)
  assert.equal(c.size, 2)
})

test('reading an entry protects it from eviction', () => {
  const evicted: string[] = []
  const c = new Lru<number>(2, (k) => evicted.push(k))
  c.set('a', 1)
  c.set('b', 2)
  c.get('a') // a is now newer than b
  c.set('c', 3)
  assert.deepEqual(evicted, ['b'])
  assert.equal(c.get('a'), 1)
})

test('has() does not count as a use', () => {
  const evicted: string[] = []
  const c = new Lru<number>(2, (k) => evicted.push(k))
  c.set('a', 1)
  c.set('b', 2)
  assert.equal(c.has('a'), true)
  c.set('c', 3)
  assert.deepEqual(evicted, ['a'])
})

test('replacing an entry does not evict anything, and hands over the evicted value', () => {
  const seen: [string, number][] = []
  const c = new Lru<number>(2, (k, v) => seen.push([k, v]))
  c.set('a', 1)
  c.set('b', 2)
  c.set('a', 10)
  assert.deepEqual(seen, [])
  assert.equal(c.get('a'), 10)
  c.set('c', 3)
  assert.deepEqual(seen, [['b', 2]])
})

test('flipping between two translations never evicts either (capacity 2)', () => {
  const evicted: string[] = []
  const c = new Lru<string>(2, (k) => evicted.push(k))
  c.set('KJV', 'text')
  c.set('BSB', 'text')
  for (let i = 0; i < 10; i++) {
    c.get('KJV')
    c.get('BSB')
  }
  assert.deepEqual(evicted, [])
})
