import type { ReactNode } from 'react'
import { planePath } from '../plan/glyphs'

const PATHS: Record<string, ReactNode> = {
  move: <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />,
  drop: <path d="M12 3.5c3.5 4.2 6 7.2 6 10.2a6 6 0 0 1-12 0c0-3 2.5-6 6-10.2z" />,
  leaf: <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14M5 19c3-4 6-7 10-9" />,
  pin: (
    <>
      <path d="M12 21s6-5.5 6-10.5a6 6 0 1 0-12 0C6 15.5 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </>
  ),
  route: (
    <>
      <path d="M6 18h4a4 4 0 0 0 4-4v-4a4 4 0 0 1 4-4" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  back: <path d="m15 5-7 7 7 7" />,
  user: <path d="M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.4-3.6 3.6-5.5 7.5-5.5s7.1 1.9 7.5 5.5" />,
  refresh: <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />,
  map: <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />,
  plan: (
    <>
      <path d="M4 7h7l5 5h4M4 17h5l3-5" />
      <circle cx="4" cy="7" r="1.6" />
      <circle cx="20" cy="12" r="1.6" />
      <circle cx="4" cy="17" r="1.6" />
    </>
  ),
  cube: <path d="m12 3-8 4.5v9L12 21l8-4.5v-9L12 3zM4 7.5 12 12l8-4.5M12 12v9" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  sliders: (
    <>
      <path d="M4 7h8M18 7h2M4 17h2M12 17h8" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  train: (
    <>
      <rect x="6" y="3.5" width="12" height="13" rx="3" />
      <path d="M6 11h12M9 20l-2 1.5M15 20l2 1.5M9 16.5v.01M15 16.5v.01" />
    </>
  ),
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  city: <path d="M4 20V9l6-3v14M10 20V4l6 3v13M16 20v-8l4 2v6M3 20h18" />,
  edit: <path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />,
  zoomin: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2M11 8v6M8 11h6" />
    </>
  ),
  zoomout: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2M8 11h6" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" />
    </>
  ),
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  mountain: <path d="M3 19 9 8l4 6 3-4 5 9H3z" />,
  layers: <path d="m12 4-9 5 9 5 9-5-9-5zM3 14l9 5 9-5" />,
  house: <path d="m4 11 8-7 8 7M6 10v9h12v-9M10 19v-5h4v5" />,
  plane: <path d={planePath(12, 12, 9, 45)} />,
  eraser: <path d="M8 19h11M5 14l7-8 6 6-6 7H8zM9.5 9.5l5 5" />,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  stadium: (
    <>
      <ellipse cx="12" cy="12" rx="9" ry="5.5" />
      <ellipse cx="12" cy="12" rx="4.5" ry="2.2" />
    </>
  ),
  arch: <path d="M5 20V11a7 7 0 0 1 14 0v9M9 20v-6a3 3 0 0 1 6 0v6M3 20h18" />,
  alert: <path d="M12 4 3 20h18L12 4zM12 10v4M12 17.2v.1" />,
  sparkle: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  undo2: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
}

export type IconName = keyof typeof PATHS

export default function Icon({
  name,
  size = 22,
  stroke = 1.8,
  className,
}: {
  name: IconName
  size?: number
  stroke?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}
