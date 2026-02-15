import { formatDistanceToNow } from 'date-fns'

export function formatTimeAgo(timestamp: number): string {
  const timeAgo = formatDistanceToNow(new Date(timestamp * 1000), { addSuffix: true })

  return timeAgo
    .replace('over ', '')
    .replace('about ', '')
    .replace('almost ', '')
    .replace('seconds ago', 'seconds')
    .replace('second ago', 'second')
    .replace('minutes ago', 'minutes')
    .replace('minute ago', 'minute')
    .replace('hours ago', 'hours')
    .replace('hour ago', 'hour')
}
