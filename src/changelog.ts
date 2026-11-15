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
    version: '0.10.0',
    date: '2026-11-16',
    headline: 'Wald und Gebirge',
    changes: [
      {
        title: 'Wald malen',
        what: 'Du kannst Waldflächen auf das Land malen. Jeder Wald bekommt einen eigenen Namen.',
        how: 'Öffne Terraforming, dann „Gebiete“, und wähle „Wald“. Male mit dem Finger über das Land. In 3D wachsen dort Bäume, auf der Karte erscheinen beim Hineinzoomen kleine Bäume. Die Bäume halten Abstand zu Gleisen und Bahnhöfen.',
        benefit: 'Deine Landschaft sieht lebendig aus, und Wälder lassen sich auf der Karte wiederfinden.',
      },
      {
        title: 'Gebirge malen',
        what: 'Gebirge sind Gebiete, in denen das Land nach innen immer höher wird. In der Mitte stehen Gipfel, am Rand ist der Boden noch flach.',
        how: 'Wähle „Gebirge“ und male das Gebiet. In 3D siehst du die Berge. Gleise und Bahnhöfe bleiben befahrbar: Der Berg weicht ihnen aus, sodass die Strecke in einem Tal verläuft.',
        benefit: 'Du kannst Strecken durch bergiges Land planen und siehst, wie sie sich ins Gelände legen.',
      },
      {
        title: 'Namen für Wald und Gebirge',
        what: 'Wälder und Gebirge bekommen automatisch einen erfundenen Namen. Eigene Wunschnamen kommen zuerst dran.',
        how: 'Mit dem Pfeil neben dem Namen würfelst du einen neuen. Wunschnamen trägst du unter „Namen für Neues“ ein.',
        benefit: 'Auch die Landschaft hat Orte mit Namen.',
      },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-11-16',
    headline: 'Namen für alles',
    changes: [
      {
        title: 'Gewässer benennen',
        what: 'Seen, Flüsse, Kanäle und das Meer können einen Namen bekommen. Das Spiel erkennt, was es ist: ein See ist breit, ein Fluss ist lang und schmal. Fließt ein Fluss in einen See, sind es zwei Gewässer mit eigenem Namen.',
        how: 'Öffne Terraforming und wähle „Gewässer“. Tippe auf das Wasser: Es bekommt sofort einen Namen und eine Art. Oben im Menü änderst du den Namen, die Art (zum Beispiel Fluss oder Kanal), würfelst einen neuen Namen oder entfernst ihn. Große Gewässer am Kartenrand können auch ein Meer sein.',
        benefit: 'Deine Karte bekommt Orte mit Namen, und die Gewässer erscheinen in blauer Schrift auf der Karte.',
      },
      {
        title: 'Namen, die sich das Spiel ausdenkt',
        what: 'Neue Bezirke und Vororte bekommen automatisch einen Namen aus mehr als 500 vorbereiteten, erfundenen Ortsnamen. Ähnliche Namen wie Rotterfeld und Rotterhagen kommen nie in derselben Stadt vor.',
        how: 'Du musst nichts tun. Mit dem Pfeil neben dem Namen im Gebiete-Menü würfelst du einen neuen.',
        benefit: 'Deine Stadt klingt nach echter Gegend, ohne dass du dir alle Namen ausdenken musst.',
      },
      {
        title: 'Wunschliste für Namen',
        what: 'Du kannst Namen aufschreiben, die du schön findest. Das Spiel nimmt sie der Reihe nach für den nächsten neuen Bezirk, Vorort, See oder Fluss.',
        how: 'Beim Gründen einer Stadt unter „Namen vorgeben“ oder später in den Stadt-Einstellungen unter „Namen für Neues“. Schreibe einen oder mehrere Namen (mit Komma getrennt) und tippe auf „Hinzufügen“.',
        benefit: 'Deine Lieblingsnamen kommen zuerst dran. Was übrig bleibt, bleibt in der Liste.',
      },
    ],
  },
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
