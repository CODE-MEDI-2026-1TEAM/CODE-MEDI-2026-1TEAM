export class SessionQueueError extends Error {}
export class SessionWorkQueue {
  private readonly sessions = new Map<string, { tail: Promise<void>; count: number }>();
  constructor(private readonly maxPerSession = 8, private readonly waitMs = 15000) {}
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const entry = this.sessions.get(key) ?? { tail: Promise.resolve(), count: 0 };
    if (entry.count >= this.maxPerSession || (!this.sessions.has(key) && this.sessions.size >= 1024))
      return Promise.reject(new SessionQueueError('session_queue_full'));
    this.sessions.set(key, entry);
    entry.count++;
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    let resolve: (value: T) => void, reject: (error: unknown) => void;
    const result = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    timer = setTimeout(() => { expired = true; reject(new SessionQueueError('session_queue_timeout')); }, this.waitMs);
    entry.tail = entry.tail.then(async () => {
      clearTimeout(timer);
      try {
        if (!expired) resolve(await work());
      } catch (error) { reject(error); }
      finally {
        // Release admission before a caller observing the result can enqueue again.
        entry.count--;
        if (!entry.count) this.sessions.delete(key);
      }
    });
    return result;
  }
}
