/**
 * Simple promise-pool concurrency limiter used to bound parallel 42 API
 * requests when a bulk endpoint/filter isn't available (avoids N+1 bursts).
 */
export function createConcurrencyLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  function next(): void {
    active -= 1;
    const resolve = queue.shift();
    if (resolve) {
      active += 1;
      resolve();
    }
  }

  async function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      next();
    }
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  maxConcurrent: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limiter = createConcurrencyLimiter(maxConcurrent);
  return Promise.all(items.map((item, index) => limiter(() => mapper(item, index))));
}
