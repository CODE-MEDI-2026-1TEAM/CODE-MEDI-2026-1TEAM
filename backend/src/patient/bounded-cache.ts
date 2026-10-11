export class BoundedCache<T> {
  private readonly entries = new Map<string, { expires: number; value: T }>();
  private readonly pending = new Map<string, Promise<T>>();
  hits = 0;
  misses = 0;
  constructor(
    private readonly capacity = 256,
    private readonly ttlMs = 300_000,
  ) {}
  get(key: string): T | undefined {
    const row = this.entries.get(key);
    if (!row || row.expires <= Date.now()) {
      this.entries.delete(key);
      this.misses++;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, row);
    this.hits++;
    return structuredClone(row.value);
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    while (this.entries.size >= this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, {
      value: structuredClone(value),
      expires: Date.now() + this.ttlMs,
    });
  }
  delete(key: string) { this.entries.delete(key); }
  async resolve(key: string, work: () => Promise<T>, accept: (value: T) => boolean = () => true): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const pending = this.pending.get(key);
    if (pending) return structuredClone(await pending);
    const promise = work().then((value) => {
      if (accept(value)) this.set(key, value);
      return value;
    });
    this.pending.set(key, promise);
    try {
      return structuredClone(await promise);
    } finally {
      this.pending.delete(key);
    }
  }
}
