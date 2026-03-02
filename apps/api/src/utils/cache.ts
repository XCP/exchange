export function cacheControl(url: URL, defaultTtl: number, blockTtl = 3600): string {
  return `public, max-age=${url.searchParams.has('_block') ? blockTtl : defaultTtl}`
}
