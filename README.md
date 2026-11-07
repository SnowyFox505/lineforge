# LineForge

PWA (iPhone zuerst, später Desktop), in der man fiktive Städte baut und darauf Liniennetze im Stil von Berlin/München zeichnet. Gebaut wird in 2D, die 3D-Ansicht zeigt Stadt, Gleise und fahrende Züge.

## Entwicklung

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm test     # Vitest
pnpm lint     # Oxlint
pnpm build    # Typecheck + Produktions-Build (inkl. PWA)
```

Die Fahrzeug-Galerie ist unter `#fahrzeuge` erreichbar (oder im Menü „Meine Städte“ → „Fahrzeuge“).

## Stack

Vite, React 19, TypeScript, Tailwind 4, Zustand + Immer, Canvas 2D (Karte), three.js über @react-three/fiber (3D), Dexie (IndexedDB), vite-plugin-pwa.
