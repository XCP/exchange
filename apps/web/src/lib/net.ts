/**
 * The rule a Cloudflare Worker has to follow when it abandons a response.
 *
 * A Worker may hold only six outbound connections open at once. A `Response`
 * whose body is never read and never cancelled keeps its slot until garbage
 * collection, which may be long after the render that made it finished. Do that
 * on an error path — `if (!res.ok) return null` is the usual shape — and a
 * struggling upstream turns every failed read into a leaked slot. Past six, the
 * runtime cancels the oldest in-flight response to avoid deadlock and logs
 * "A stalled HTTP response was canceled to prevent deadlock". The cancelled
 * response belongs to some other, innocent request, so the symptom never points
 * at the code that caused it.
 *
 * The asset page is where this shows: one render issues six of these reads
 * against a key space of 248k assets, and every miss used to leak.
 */

/**
 * Let go of a response we are not going to read.
 *
 * Call it on every path that abandons a `Response` — before a `throw`, before
 * `return null`, before falling through to a second attempt. Cancelling is
 * cheap and releases the connection immediately, where dropping the reference
 * releases it whenever the collector next runs.
 *
 * Never throws: this is cleanup on a path that already failed, and a failure to
 * cancel must not replace the error the caller is actually reporting.
 */
export async function discard(response: Response | null | undefined): Promise<void> {
  try {
    await response?.body?.cancel()
  } catch {
    // Already cancelled, already consumed, or never had a body. Nothing owed.
  }
}
