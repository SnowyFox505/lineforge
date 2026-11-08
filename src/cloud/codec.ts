import type { CityDoc } from '../model/types'
import { exportCityJson, importCityJson } from '../persistence/db'

/** Largest cloud document we write (Firestore allows 1 MiB per document) */
export const MAX_BYTES = 950_000

const RAW = 0
const GZIP = 1

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

/** A city as compact bytes: JSON, gzip-compressed (maps are mostly empty cells and shrink to a few KB). */
export async function encodeCity(doc: CityDoc): Promise<Uint8Array> {
  const json = new TextEncoder().encode(exportCityJson(doc))
  let body: Uint8Array = json
  let kind = RAW
  if (typeof CompressionStream !== 'undefined') {
    body = await pipe(json, new CompressionStream('gzip'))
    kind = GZIP
  }
  const out = new Uint8Array(body.length + 1)
  out[0] = kind
  out.set(body, 1)
  if (out.length > MAX_BYTES) throw new Error('Die Stadt ist zu groß für den Cloud-Speicher')
  return out
}

export async function decodeCity(bytes: Uint8Array): Promise<CityDoc> {
  const body = bytes.subarray(1)
  const json = bytes[0] === GZIP ? await pipe(body, new DecompressionStream('gzip')) : body
  return importCityJson(new TextDecoder().decode(json), true)
}
