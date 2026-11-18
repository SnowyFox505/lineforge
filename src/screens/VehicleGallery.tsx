import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useState } from 'react'
import { LINE_COLORS, OPERATORS } from '../model/constants'
import { trainLength, VEHICLE_MODELS, vehicleFor } from '../model/vehicles'
import type { OperatorId } from '../model/types'
import Icon from '../ui/Icon'
import { TrainStatic } from '../view3d/vehicles3d'

const ORDER: OperatorId[] = ['sbahn', 'ubahn', 'tram', 'regional', 'fernverkehr']
const DEFAULT_COLOR: Record<OperatorId, string> = {
  sbahn: '#d6232b',
  ubahn: '#1f6fd1',
  tram: '#1f5fe0',
  regional: '#f0f0f0',
  fernverkehr: '#d6232b',
}

/** Showroom for the vehicle models: pick a type and a line colour, orbit around it. */
export default function VehicleGallery({ onClose }: { onClose: () => void }) {
  // the address can pick what to show: #fahrzeuge?k=sbahn&m=481&view=front|front34|side|rear|top&c=ff8a00 (handy for screenshots)
  const q = new URLSearchParams(location.hash.split('?')[1] ?? '')
  const [kind, setKind] = useState<OperatorId>((q.get('k') as OperatorId) || 'sbahn')
  const [color, setColor] = useState<string | null>(q.get('c') ? `#${q.get('c')}` : null)
  const [head, setHead] = useState(false)
  const [model, setModel] = useState<string | undefined>(q.get('m') ?? undefined)
  const view = q.get('view')
  const models = VEHICLE_MODELS[kind] ?? []
  const spec = vehicleFor(kind, model)
  const line = color ?? DEFAULT_COLOR[kind]
  const len = trainLength(spec)
  const dist = head ? 4.4 : Math.max(3.4, len * 1.3)
  const tx = head ? len / 2 - 0.9 : 0
  const hy = 0.5 + spec.height * 0.5
  // fixed cameras for the `view` parameter: position and target
  const fixed: Record<string, [[number, number, number], [number, number, number]]> = {
    front: [[len / 2 + 2.3, hy, 0.15], [len / 2, hy, 0]],
    front34: [[len / 2 + 1.7, hy + 0.3, 1.6], [len / 2 - 0.4, hy - 0.05, 0]],
    side: [[len / 2 - 1.2, hy, 2.7], [len / 2 - 1.2, hy, 0]],
    rear: [[-len / 2 - 1.7, hy + 0.3, -1.6], [-len / 2 + 0.4, hy - 0.05, 0]],
    top: [[len / 2 - 1, hy + 3, 0.3], [len / 2 - 1, hy, 0]],
  }
  const cam = view ? fixed[view] : undefined

  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, #1d2d3d 0%, #0a1017 60%, #06080c 100%)' }}>
      <Canvas key={`${kind}${spec.model}${head}`} camera={{ position: cam ? cam[0] : head ? [len / 2 + 1.7, 0.5 + spec.height * 1.1, 1.6] : [dist * 0.75, dist * 0.3, dist * 0.7], fov: 34, near: 0.1, far: 200 }} gl={{ antialias: true, preserveDrawingBuffer: true }} dpr={[1, 2]}>
        <hemisphereLight args={['#dfe8ff', '#2a3a35', 1.5]} />
        <directionalLight position={[6, 9, 5]} intensity={2.4} color="#fff0d9" />
        <directionalLight position={[-6, 3, -5]} intensity={0.5} color="#7aa8ff" />
        <group>
          <mesh position={[0, 0.5 - 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[len * 0.8, 64]} />
            <meshStandardMaterial color="#27313d" roughness={0.95} />
          </mesh>
          {[-0.085, 0.085].map((z) => (
            <mesh key={z} position={[0, 0.5 + 0.06, z]}>
              <boxGeometry args={[len * 1.4, 0.035, 0.035]} />
              <meshStandardMaterial color="#cfd6df" metalness={0.8} roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 0.5 + 0.03, 0]}>
            <boxGeometry args={[len * 1.4, 0.06, 0.5]} />
            <meshStandardMaterial color="#4a4d54" roughness={1} />
          </mesh>
          <TrainStatic spec={spec} color={line} />
        </group>
        <OrbitControls makeDefault enableDamping autoRotate={!head && !cam} autoRotateSpeed={0.9} target={cam ? cam[1] : [tx, 0.5 + spec.height * 0.5, 0]} minDistance={1.2} maxDistance={len * 2} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>

      <button onClick={onClose} aria-label="Zurück" className="glass absolute left-4 top-[calc(14px+var(--safe-top))] grid h-11 w-11 place-items-center rounded-full active:scale-90">
        <Icon name="back" size={20} />
      </button>
      <div className="pointer-events-none absolute left-0 right-0 top-[calc(18px+var(--safe-top))] text-center">
        <p className="text-lg font-bold tracking-tight">{OPERATORS[kind].label}</p>
        <p className="text-xs text-white/50">Fahrzeug-Galerie · ziehen zum Drehen, zwei Finger zum Zoomen</p>
      </div>

      <div className="glass absolute inset-x-3 bottom-[calc(14px+var(--safe-bottom))] rounded-3xl p-3">
        <div className="[scrollbar-width:none] flex gap-2 overflow-x-auto">
          {ORDER.map((k) => (
            <button key={k} onClick={() => { setKind(k); setModel(undefined) }} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${k === kind ? 'bg-accent text-ink' : 'btn-soft'}`}>
              {OPERATORS[k].label}
            </button>
          ))}
          {models.length > 1 &&
            models.map((m) => (
              <button key={m.model} onClick={() => setModel(m.model)} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${m.model === spec.model ? 'bg-accent text-ink' : 'btn-soft'}`}>
                {m.label ?? m.model}
              </button>
            ))}
          <button onClick={() => setHead((h) => !h)} className={`ml-auto shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${head ? 'bg-accent text-ink' : 'btn-soft'}`}>
            Kopf
          </button>
        </div>
        <div className="[scrollbar-width:none] mt-3 flex items-center gap-2 overflow-x-auto">
          <span className="shrink-0 pr-1 text-xs uppercase tracking-wider text-white/45">Linienfarbe</span>
          {LINE_COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} aria-label={c} className={`h-8 w-8 shrink-0 rounded-full border-2 ${line === c ? 'border-white' : 'border-transparent'}`} style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  )
}
