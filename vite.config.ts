import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

/**
 * Every build gets an id of its own. It is compiled into the app (`__APP_BUILD__`) and written to `version.json`
 * next to it, so a running app can ask the server whether a newer build exists (the dot on "Aktualisieren").
 */
const build = `${(process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7)}-${Date.now().toString(36)}`

function versionFile(): Plugin {
  return {
    name: 'lineforge-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version, build }) })
    },
  }
}

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(command === 'build' ? build : 'dev'),
  },
  plugins: [
    react(),
    tailwindcss(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'LineForge',
        short_name: 'LineForge',
        description: 'Liniennetzpläne für fiktive Städte erstellen',
        lang: 'de',
        theme_color: '#06080c',
        background_color: '#06080c',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
}))
