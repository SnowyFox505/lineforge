// Generates the PWA / iOS icons from the brand mark. Run: node scripts/make-icons.mjs
// Dark tile with a lime mark: stays readable when iOS darkens home-screen icons in dark mode.
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const mark = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><g fill="none" stroke="#c4f03a" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"><path d="M112 340h112l80-100h96"/><path d="M112 172h96l56 56"/></g><circle cx="400" cy="240" r="30" fill="#c4f03a"/><circle cx="112" cy="172" r="30" fill="#c4f03a"/></g>`

export const svg = (rx, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b232d"/><stop offset="1" stop-color="#090c11"/></linearGradient><radialGradient id="h" cx="0.5" cy="0.55" r="0.55"><stop offset="0" stop-color="#c4f03a" stop-opacity="0.16"/><stop offset="1" stop-color="#c4f03a" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" rx="${rx}" fill="url(#g)"/><rect width="512" height="512" rx="${rx}" fill="url(#h)"/>${mark(scale)}</svg>`

const jobs = [
  ['public/pwa-192.png', svg(112, 1.1), 192],
  ['public/pwa-512.png', svg(112, 1.1), 512],
  ['public/pwa-maskable-512.png', svg(0, 0.82), 512],
  ['public/apple-touch-icon.png', svg(0, 1.0), 180],
]
for (const [file, s, size] of jobs) {
  writeFileSync(file, await sharp(Buffer.from(s)).resize(size, size).png().toBuffer())
  console.log('wrote', file)
}
writeFileSync('public/favicon.svg', svg(112, 1.1))
console.log('wrote public/favicon.svg')
