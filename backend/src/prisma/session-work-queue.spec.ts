import { SessionWorkQueue } from './session-work-queue';
describe('Session work admission before DB acquisition', () => {
  it('serializes one session while allowing a different session to complete', async () => {
    const queue = new SessionWorkQueue();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => finish = resolve);
    const calls: string[] = [];
    const first = queue.run('a', async () => { calls.push('first'); await gate; });
    const second = queue.run('a', async () => { calls.push('second'); });
    await queue.run('b', async () => { calls.push('other'); });
    expect(calls).toEqual(['first', 'other']);
    finish(); await Promise.all([first, second]);
    expect(calls).toEqual(['first', 'other', 'second']);
  });
  it('rejects overflow and progresses after a failed turn', async () => {
    const queue = new SessionWorkQueue(1);
    let fail!: (error: Error) => void;
    const first = queue.run('a', () => new Promise((_, reject) => fail = reject));
    await expect(queue.run('a', async () => 2)).rejects.toThrow('session_queue_full');
    fail(new Error('provider')); await expect(first).rejects.toThrow('provider');
    expect(await queue.run('a', async () => 3)).toBe(3);
    expect(await queue.run('a', async () => 4)).toBe(4);
  });
  it('never runs an expired queued request or its provider work', async () => {
    jest.useFakeTimers();
    try {
      const queue = new SessionWorkQueue(2, 10);
      let finish!: () => void;
      const first = queue.run('a', () => new Promise<void>((resolve) => finish = resolve));
      await Promise.resolve();
      const work = jest.fn(async () => true);
      const second = queue.run('a', work);
      const rejected = expect(second).rejects.toThrow('session_queue_timeout');
      await jest.advanceTimersByTimeAsync(11); await rejected;
      finish(); await first; await Promise.resolve();
      expect(work).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
});
