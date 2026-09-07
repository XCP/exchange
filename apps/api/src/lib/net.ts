/**
 * Releasing a response the code has given up on, and bounding a fan-out.
 *
 * A Cloudflare Worker may hold six outbound connections at once. A `Response`
 * whose body is never read and never cancelled keeps its slot until garbage
 * collection, so `if (!res.ok) throw` leaks a connection every time an upstream
 * misbehaves. Past six, the runtime cancels the oldest in-flight response to
 * avoid deadlock and logs "A stalled HTTP response was canceled to prevent
 * deadlock" — against whichever request happened to be oldest, never the one at
 * fault.
 *
 * The indexer is where this bites hardest: one cron tick makes many of these
 * calls, several of them in retry loops that sleep while still holding a body
 * they have already abandoned.
 */

/**
 * Let go of a response we are not going to read.
 *
 * Call it on every path that abandons a `Response` — before a `throw`, before
 * an early `return`, before falling through to a fallback provider. Cancelling
 * releases the connection immediately, where dropping the reference releases it
 * whenever the collector next runs.
 *
 * Never throws: this is cleanup on a path that already failed, and a failure to
 * cancel must not replace the error the caller is reporting.
 */
export async function discard(response: Response | null | undefined): Promise<void> {
  try {
    await response?.body?.cancel();
  } catch {
    // Already cancelled, already consumed, or never had a body. Nothing owed.
  }
}

/**
 * `Promise.all(items.map(fn))` with a ceiling on how many run at once.
 *
 * Results keep the order of `items`. `limit` defaults to four, below the
 * platform's six, so a fan-out leaves room for the rest of the invocation.
 *
 * A rejection propagates, as it would from `Promise.all` — this bounds
 * concurrency, it does not change error handling.
 */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = 4
): Promise<R[]> {
  if (items.length === 0) return [];
  const ceiling = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  // Each worker pulls the next index until the list is exhausted, so a slow
  // element delays only itself. Fixed chunks would make every chunk wait for
  // its slowest member.
  const workers = Array.from({ length: ceiling }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!, index);
    }
  });

  await Promise.all(workers);
  return results;
}
