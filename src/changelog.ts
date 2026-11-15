import { compareVersions } from './version'

/** One thing that is new, explained for someone who knows nothing about it. */
export interface Change {
  title: string
  /** What it is */
  what: string
  /** How to use it */
  how: string
  /** What it brings you */
  benefit: string
}

export interface Release {
  /** Same as `version` in package.json for the newest entry */
  version: string
  /** yyyy-mm-dd */
  date: string
  /** One line for the whole release */
  headline: string
  changes: Change[]
}

/**
 * The patch notes, newest first. With every update: raise `version` in package.json, add a release at the top
 * (the test in changelog.test.ts checks that the two match) and write it in plain words:
 * what is new, how does it work, what do I get from it.
 */
export const RELEASES: Release[] = [
  {
    version: '0.8.0',
    date: '2026-11-15',
    headline: 'Stationen, Nacht und Updates',
    changes: [
      {
        title: 'Updates und Neuigkeiten',
        what: 'Wenn es eine neue Version gibt, erscheint ein Punkt am Knopf „Aktualisieren“. Nach dem Update öffnet sich dieses Fenster.',
        how: 'Tippe im Menü oben rechts auf „Aktualisieren“. Deine Städte bleiben erhalten. Die Versionsnummer unten im Menü öffnet die Liste aller Neuerungen.',
        benefit: 'Du siehst sofort, dass es etwas Neues gibt, und weißt danach, was sich geändert hat.',
      },
      {
        title: 'Haltestellen bauen',
        what: 'Beim Bauen gibt es nur noch „Bahn-Haltestelle“ und „Tram-Haltestelle“. Alles andere ergibt sich von selbst.',
        how: 'Halten zwei Linien an einer Haltestelle, wird sie automatisch zum Umsteigebahnhof (größeres Symbol). Den Hauptbahnhof bestimmst du mit „Zum Hbf machen“ an der Station, auf der Karte oder im 3D-Bahnhof-Editor. Eine Station auf dem Flughafengelände ist der Flughafenbahnhof.',
        benefit: 'Weniger Auswahl beim Bauen, und die Stationen passen immer zu dem, was an ihnen passiert.',
      },
      {
        title: 'Kleineres Schienennetz in 3D',
        what: 'Züge, Gleise, Bahnsteige und Bahnhöfe sind kleiner geworden, Häuser und Straßen bleiben wie sie waren.',
        how: 'Du musst nichts tun, es gilt für alle Städte.',
        benefit: 'Die Bahn steht in einem besseren Verhältnis zu Straßen und Häusern.',
      },
      {
        title: 'Züge bleiben auf ihrem Gleis',
        what: 'Auf Strecken, die nebeneinander laufen, wechseln Züge nicht mehr mitten auf der Strecke das Gleis. Am Endbahnhof fahren sie über eine kurze Weiche auf das andere Gleis.',
        how: 'Du musst nichts tun. Schau dir einen Endbahnhof in 3D an.',
        benefit: 'Der Betrieb sieht echt aus statt zu wackeln.',
      },
      {
        title: 'Tag und Nacht in 3D',
        what: 'Die Spielzeit läuft mit: Sonne, Mond und Sterne, abends gehen Lichter an. Häuser haben beleuchtete Fenster, Züge Scheinwerfer und leuchtende Fenster.',
        how: 'Die Uhr oben zeigt die Spielzeit. Eine echte Minute ist eine Spielstunde. Wechsle in die 3D-Ansicht.',
        benefit: 'Die Stadt wirkt lebendig, und nachts sieht die Karte ganz anders aus.',
      },
      {
        title: 'Zügen folgen',
        what: 'In 3D kannst du einen Zug antippen und ihm folgen: von hinten, von der Seite, aus dem Führerstand oder frei umschauen.',
        how: 'Tippe in 3D auf einen fahrenden Zug und wähle oben die Ansicht.',
        benefit: 'Du erlebst dein Netz so, wie Fahrgäste es sehen.',
      },
    ],
  },
]

/** The newest release */
export const LATEST: Release = RELEASES[0]

/**
 * What to show after an update: all releases newer than the one the person saw last (newest first).
 * Nobody has seen anything yet (`lastSeen` is null): just the newest release.
 */
export function releasesSince(lastSeen: string | null): Release[] {
  if (!lastSeen) return [LATEST]
  return RELEASES.filter((r) => compareVersions(r.version, lastSeen) > 0)
}
