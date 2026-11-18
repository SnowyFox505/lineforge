import type { VehicleSpec } from '../../model/vehicles'
import { sbahn484 } from './sbahn484'
import type { ModelDef } from './types'

/**
 * Detailed vehicle models by `${kind}${model}` (see `modelKey`). A vehicle without an entry here is built by the generic shell in
 * vehicles3d.tsx alone. To add a model: write `<name>.ts` next to this file, export a `ModelDef`, register it here, give the
 * type an entry in `STYLES` (vehicles3d.tsx) and in `VEHICLE_MODELS` (model/vehicles.ts).
 */
export const MODELS: Record<string, ModelDef> = {
  sbahn484,
}

export const modelKey = (spec: Pick<VehicleSpec, 'kind' | 'model'>) => (spec.model ? `${spec.kind}${spec.model}` : spec.kind)
export const modelOf = (spec: Pick<VehicleSpec, 'kind' | 'model'>): ModelDef | undefined => MODELS[modelKey(spec)]
