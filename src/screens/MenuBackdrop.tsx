import { motion } from 'motion/react'

interface BackdropLine {
  d: string
  color: string
  stations: [number, number][]
  big?: [number, number][]
}

const LINES: BackdropLine[] = [
  {
    d: 'M -20 610 H 110 L 210 510 V 330 L 330 210 H 420',
    color: '#ff5470',
    stations: [[110, 610], [210, 510], [210, 330], [330, 210]],
  },
  {
    d: 'M 70 -20 V 200 L 190 320 V 470 L 310 590 H 420',
    color: '#3db8ff',
    stations: [[70, 200], [190, 320], [310, 590]],
    big: [[190, 430]],
  },
  {
    d: 'M -20 330 H 90 L 190 430 H 420',
    color: '#a6e03c',
    stations: [[90, 330], [330, 430]],
  },
  {
    d: 'M 330 -20 V 110 L 250 190 V 260 L 150 360 V 560 L 90 620 V 820',
    color: '#ffc233',
    stations: [[330, 110], [250, 190], [150, 360], [150, 560], [90, 620]],
  },
  {
    d: 'M 420 700 H 260 L 190 770 V 820',
    color: '#9a6bff',
    stations: [[260, 700], [190, 770]],
  },
]

/** Animated network that draws itself, with little trains running along the lines. */
export default function MenuBackdrop({ dim = false }: { dim?: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* drifting colour glows */}
      <motion.div
        className="absolute -left-24 top-10 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: 'radial-gradient(circle, #2b6cff 0%, transparent 70%)' }}
        animate={{ x: [0, 50, -20, 0], y: [0, 40, 70, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-32 top-1/3 h-[26rem] w-[26rem] rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #c4f03a 0%, transparent 70%)' }}
        animate={{ x: [0, -60, 10, 0], y: [0, -30, 50, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-20 left-1/4 h-80 w-80 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(circle, #e055c4 0%, transparent 70%)' }}
        animate={{ x: [0, 40, -40, 0], y: [0, -40, 10, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />

      <svg
        className="absolute inset-0 h-full w-full md:left-auto md:w-[58%] md:[mask-image:linear-gradient(to_right,transparent,black_30%)]"
        viewBox="0 0 400 800"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        {LINES.map((l, i) => (
          <g key={l.d}>
            <motion.path
              d={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={9}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
              opacity={0.55}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.9, delay: 0.3 + i * 0.28, ease: [0.22, 1, 0.36, 1] }}
            />
            <motion.path
              d={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.9, delay: 0.3 + i * 0.28, ease: [0.22, 1, 0.36, 1] }}
            />
            {l.stations.map(([x, y], k) => (
              <motion.circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r={6.5}
                fill="#fff"
                stroke="#0a0e14"
                strokeWidth={3}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 1.1 + i * 0.28 + k * 0.12 }}
              />
            ))}
            {l.big?.map(([x, y]) => (
              <motion.circle
                key={`b${x}-${y}`}
                cx={x}
                cy={y}
                r={10}
                fill="#fff"
                stroke="#0a0e14"
                strokeWidth={4.5}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 1.9 }}
              />
            ))}
            <circle r={4.5} fill="#fff" opacity={0}>
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.95;1" dur={`${9 + i * 1.7}s`} begin={`${2.6 + i * 0.9}s`} repeatCount="indefinite" />
              <animateMotion dur={`${9 + i * 1.7}s`} begin={`${2.6 + i * 0.9}s`} repeatCount="indefinite" path={l.d} />
            </circle>
          </g>
        ))}
      </svg>

      {/* sub-screens: calm the background so forms stay readable */}
      <motion.div
        className="absolute inset-0 backdrop-blur-[10px]"
        style={{ background: 'rgba(7,9,13,0.72)' }}
        initial={false}
        animate={{ opacity: dim ? 1 : 0 }}
        transition={{ duration: 0.4 }}
      />

      {/* fade so text and buttons stay readable */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,9,13,0.55) 0%, rgba(7,9,13,0.15) 30%, rgba(7,9,13,0.55) 62%, rgba(7,9,13,0.96) 100%)' }} />
    </div>
  )
}
