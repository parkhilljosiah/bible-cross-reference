/**
 * A small "least recently used" cache: it keeps the `capacity` most recently used entries and hands the oldest back to
 * `onEvict` when a new one pushes it out. Only erasable TypeScript syntax, so `node --test` can run it directly.
 */
export class Lru<V> {
  private map = new Map<string, V>()
  private capacity: number
  private onEvict?: (key: string, value: V) => void

  constructor(capacity: number, onEvict?: (key: string, value: V) => void) {
    this.capacity = capacity
    this.onEvict = onEvict
  }

  /** The entry, marked as most recently used; undefined if it is not cached. */
  get(key: string): V | undefined {
    const value = this.map.get(key)
    if (value !== undefined) {
      this.map.delete(key)
      this.map.set(key, value)
    }
    return value
  }

  /** Whether the entry is cached, without counting as a use. */
  has(key: string): boolean {
    return this.map.has(key)
  }

  set(key: string, value: V): void {
    this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.capacity) {
      const [oldest, evicted] = this.map.entries().next().value!
      this.map.delete(oldest)
      this.onEvict?.(oldest, evicted)
    }
  }

  get size(): number {
    return this.map.size
  }
}
