import Link from 'next/link'

interface Segment {
  href: string
  label: string
  active: boolean
}

export default function SegmentedNav({ segments }: { segments: Segment[] }) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
      {segments.map(segment => (
        <Link
          key={segment.href}
          href={segment.href}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            segment.active
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-950/40'
              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
          }`}
        >
          {segment.label}
        </Link>
      ))}
    </div>
  )
}
