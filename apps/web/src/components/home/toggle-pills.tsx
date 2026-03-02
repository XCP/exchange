'use client'

export function TogglePills<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label?: (v: T) => string
}) {
  return (
    <div className="flex gap-0.5">
      {options.map((opt) => (
        <button
          key={String(opt)}
          onClick={() => onChange(opt)}
          className={`px-2 py-0.5 text-[10px] font-mono rounded-sm transition-colors ${
            value === opt
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          {label ? label(opt) : String(opt)}
        </button>
      ))}
    </div>
  )
}
