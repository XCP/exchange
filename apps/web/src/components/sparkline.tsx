interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ data, width = 300, height = 80, color = '#22c55e' }: SparklineProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const padY = height * 0.1

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - padY - ((v - min) / range) * (height - padY * 2)
      return `${x},${y}`
    })
    .join(' ')

  const endColor = data[data.length - 1] >= data[0] ? '#22c55e' : '#ef4444'
  const lineColor = color === '#22c55e' ? endColor : color

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
