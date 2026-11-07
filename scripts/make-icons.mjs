// Generates the PWA / iOS icons from the brand mark. Run: node scripts/make-icons.mjs
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'

const mk = (rx, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6fb5c"/><stop offset="1" stop-color="#9bd21c"/></linearGradient></defs><rect width="512" height="512" rx="${rx}" fill="url(#g)"/><g transform="translate(256 256) scale(${scale}) translate(-256 -256)"><g fill="none" stroke="#0d1300" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"><path d="M112 340h112l80-100h96"/><path d="M112 172h96l56 56"/></g><circle cx="400" cy="240" r="26" fill="#0d1300"/><circle cx="112" cy="172" r="26" fill="#0d1300"/></g></svg>`

const jobs = [
  ['public/pwa-192.png', mk(112, 1), 192],
  ['public/pwa-512.png', mk(112, 1), 512],
  ['public/pwa-maskable-512.png', mk(0, 0.78), 512],
  ['public/apple-touch-icon.png', mk(0, 0.86), 180],
]
for (const [file, svg, size] of jobs) {
  writeFileSync(file, await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer())
  console.log('wrote', file)
}
