import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/** A name tag that floats in the scene (sprite with a canvas texture; no DOM involved). */
export default function Label3D({ text, position, height = 0.75 }: { text: string; position: [number, number, number]; height?: number }) {
  const { tex, aspect } = useMemo(() => {
    const px = 2 // render at 2x for crisp text
    const fs = 30 * px
    const padX = 18 * px
    const c = document.createElement('canvas')
    const g = c.getContext('2d')!
    g.font = `600 ${fs}px 'Space Grotesk Variable', system-ui, sans-serif`
    const w = Math.ceil(g.measureText(text).width + padX * 2)
    const h = Math.ceil(fs * 1.7)
    c.width = w
    c.height = h
    g.font = `600 ${fs}px 'Space Grotesk Variable', system-ui, sans-serif`
    g.fillStyle = 'rgba(6,10,14,0.62)'
    g.beginPath()
    g.roundRect(0, 0, w, h, h / 2)
    g.fill()
    g.fillStyle = '#f4f7fa'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, w / 2, h / 2 + fs * 0.04)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return { tex: t, aspect: w / h }
  }, [text])
  useEffect(() => () => tex.dispose(), [tex])
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={20}>
      <spriteMaterial map={tex} transparent depthTest={false} />
    </sprite>
  )
}
