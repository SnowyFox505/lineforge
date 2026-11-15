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
    version: '0.14.0',
    date: '2026-11-16',
    headline: 'Ringlinien, Express und Ausläufer',
    changes: [
      {
        title: 'Ringlinien',
        what: 'Eine Linie kann zum Ring werden: Sie fährt von der letzten Station zurück zur ersten, und die Züge drehen im Kreis, ohne an einem Ende zu wenden.',
        how: 'Linie wählen, dann auf „Ring“ tippen. Die Strecke zurück zum Anfang wird automatisch gelegt, du kannst sie wie jede andere glätten oder neu zeichnen. Noch einmal „Ring“ tippen öffnet ihn wieder, ebenso das Herausnehmen einer Strecke mit dem Werkzeug „Abschnitt“. Du brauchst mindestens drei verschiedene Stationen.',
        benefit: 'Ringbahnen um die Stadt, ohne Endstation und ohne Puffer.',
      },
      {
        title: 'Expresslinien',
        what: 'Eine Express-Linie hält nur an den wichtigen Stationen und fährt schneller. Die anderen Stationen durchfährt sie auf den Umgehungsgleisen.',
        how: 'Linie wählen, auf „Express“ tippen. Sie hält dann an beiden Enden, an Umsteigebahnhöfen, am Hauptbahnhof und am Flughafen. Unter „Hält an“ kannst du jede Station einzeln wieder dazunehmen oder auslassen. Im Netzplan steht „Express“ in der Legende.',
        benefit: 'Schnelle Verbindungen zwischen den großen Knoten, ohne jede Linie einzeln durchzugehen.',
      },
      {
        title: 'Ausläufer',
        what: 'Ein Ausläufer ist eine neue Linie, die an einer Station einer bestehenden Linie abzweigt. Sie hat die Farbe der Hauptlinie und heißt wie sie plus eine Ziffer, aus S3 wird S31, S32 und so weiter (bis S30).',
        how: 'Linie wählen, auf „Ausläufer“ tippen, dann auf der Karte die Station antippen, an der er abzweigt (eine Station zwischen den Enden). Der Ausläufer übernimmt automatisch die längere Seite der Hauptlinie. „Andere Seite“ nimmt die kürzere. Danach ziehst du von der Station aus die neue Strecke.',
        benefit: 'Verzweigungen im Netz, ohne die Hauptlinie umzubauen. Deren Strecke bleibt, wie sie ist.',
      },
    ],
  },
  {
    version: '0.13.0',
    date: '2026-11-16',
    headline: 'Linien nachbessern: glätten, neu verlegen, Stationen auf der Strecke',
    changes: [
      {
        title: 'Glätten beim Zeichnen',
        what: 'Im Linien-Werkzeug (Zeichnen) gibt es den Knopf „Glätten“. Er rundet die Strecke ab, die du zuletzt gezeichnet hast, und nimmt das Zittern der Hand heraus.',
        how: 'Zeichne einen Abschnitt und tippe auf „Glätten“. Noch einmal tippen macht ihn noch runder. Hast du nichts gezeichnet, glättet der Knopf die ganze gewählte Linie. Rückgängig geht jederzeit.',
        benefit: 'Schöne, flüssige Kurven, auch wenn der Strich nicht ganz ruhig war.',
      },
      {
        title: 'Werkzeug „Glätten“',
        what: 'Ein eigenes Werkzeug in Infrastruktur, mit dem du jede beliebige Strecke zwischen zwei Stationen glätten kannst.',
        how: 'Infrastruktur → Glätten, dann auf die Strecke tippen. Jeder Tipp rundet sie etwas mehr ab. Die Stationen bleiben, wo sie sind.',
        benefit: 'Du kannst alte, eckige Strecken nachträglich verschönern, ohne sie neu zu zeichnen.',
      },
      {
        title: 'Abschnitt neu verlegen oder entfernen',
        what: 'Das Werkzeug „Abschnitt“ wählt eine Strecke zwischen zwei Stationen. Du kannst sie neu verlegen lassen oder herausnehmen.',
        how: 'Infrastruktur → Abschnitt, auf die Strecke tippen (sie wird hervorgehoben), dann „Neu verlegen“ oder „Abschnitt entfernen“. Am Ende der Linie wird sie kürzer, in der Mitte wird sie in zwei Linien geteilt (die zweite heißt zum Beispiel S1b). Die Stationen bleiben immer auf der Karte.',
        benefit: 'Eine missglückte Strecke musst du nicht mehr mit der ganzen Linie wegwerfen.',
      },
      {
        title: 'Station direkt auf die Strecke setzen',
        what: 'Mit dem Stations-Werkzeug entsteht eine Station genau auf der Linie, wenn du darauf tippst. Laufen dort mehrere Linien zusammen oder kreuzen sie sich, halten alle dort.',
        how: 'Infrastruktur → Station, dann auf eine Linie oder auf eine Kreuzung tippen. Tipp ins Freie baut wie bisher eine einzelne Station.',
        benefit: 'Umsteigebahnhöfe an Kreuzungen entstehen mit einem einzigen Tipp.',
      },
      {
        title: 'Netzplan: Bearbeiten an und aus',
        what: 'Stationen im Netzplan lassen sich nur noch verschieben, wenn du das Bearbeiten einschaltest.',
        how: 'Im Netzplan rechts oben auf den Stift tippen. Dann Stationen ziehen, Doppeltipp auf eine Station löst sie wieder. Ausgeschaltet bewegst du mit dem Finger nur den Plan.',
        benefit: 'Beim Verschieben und Zoomen im Netzplan ziehst du nicht mehr aus Versehen eine Station weg.',
      },
    ],
  },
  {
    version: '0.12.0',
    date: '2026-11-16',
    headline: 'Ruhigere Flächen und eigene Verläufe',
    changes: [
      {
        title: 'Leichtere Flächen',
        what: 'Bezirke, Vororte, Wälder und Gebirge stechen nicht mehr so stark hervor. Ihre Farbe ist durchscheinend, sodass Gras und Straßen durchkommen.',
        how: 'Das gilt sofort für alle Städte, in Karte und 3D. Wer die kräftige Farbe lieber mag: Terraforming → Gebiete, dann „Leichte Flächen“ ausschalten.',
        benefit: 'Die Karte wirkt ruhiger, und Linien und Stationen sind besser zu sehen.',
      },
      {
        title: 'Umriss um Flächen',
        what: 'Auf Wunsch bekommt jede Fläche eine Linie als Rand.',
        how: 'Terraforming → Gebiete, dann „Umriss“ antippen. Das wirkt auf der Karte und in 3D.',
        benefit: 'Du siehst genau, wo ein Bezirk, ein Wald oder der Flughafen aufhört.',
      },
      {
        title: 'Fläche wählen',
        what: 'Statt in der Liste nach einem Bezirk zu suchen, tippst du ihn auf der Karte an und malst gleich damit weiter.',
        how: 'In den Gebiets-Werkzeugen auf „Fläche wählen“ tippen, dann auf eine bemalte Fläche tippen. Das passende Werkzeug (Stadt, Vorort, Flughafen, Wald, Gebirge) schaltet sich von selbst ein.',
        benefit: 'Du erweiterst oder änderst einen Bezirk in zwei Tippern.',
      },
      {
        title: 'Eigene Verläufe',
        what: 'Du kannst Farbverläufe aus zwei Farben selbst bauen und behalten.',
        how: 'Darstellung → beim Verlauf auf das bunte Rad tippen, Farbe 1 und Farbe 2 einstellen und „Verlauf speichern“ antippen. Gespeicherte Verläufe stehen danach neben den fertigen. Mit „Gespeicherten Verlauf entfernen“ wirfst du einen wieder raus.',
        benefit: 'Dein Look gehört dir, und du kannst zwischen deinen Lieblingsverläufen wechseln.',
      },
    ],
  },
  {
    version: '0.11.0',
    date: '2026-11-16',
    headline: 'Hell, bunt und für den Stift',
    changes: [
      {
        title: 'Heller Modus',
        what: 'Die App gibt es jetzt auch hell. Menüs, Fenster, Startbildschirm, Ladebildschirm und Netzplan werden hell. Die Karte, das Netz und die 3D-Ansicht behalten ihre Farben.',
        how: 'Tippe im Startmenü oben auf das Farbpalette-Symbol (in der Stadt: Einstellungen, dann „Darstellung und Stift“) und wähle „Hell“, „Dunkel“ oder „Wie Gerät“. Bei „Wie Gerät“ wechselt die App mit deinem Handy oder Computer zwischen Tag und Nacht.',
        benefit: 'Bei Tageslicht ist die App besser lesbar, und du kannst den Look wählen, der dir gefällt.',
      },
      {
        title: 'Farben mit Verlauf',
        what: 'Zusätzlich zu den vier Akzentfarben gibt es vier Farbverläufe (Lagune, Sonnenuntergang, Ozean, Beere). Du kannst auch einen eigenen bauen: eine Farbe wählen und eine zweite dazunehmen.',
        how: 'Unter „Darstellung“ tippe auf einen Verlauf. Für einen eigenen wählst du „Eigene Farbe“, stellst den Farbton ein und schaltest „Zweite Farbe (Verlauf)“ an. Eine Vorschau zeigt, wie Knöpfe aussehen. Das gilt auch ohne Konto; mit Konto folgt die Farbe dir auf jedes Gerät.',
        benefit: 'Knöpfe, aktive Tabs und Markierungen bekommen deinen eigenen Look. Die Schrift bleibt dabei immer lesbar.',
      },
      {
        title: 'Apple Pencil',
        what: 'Auf dem iPad zeichnet der Stift, und Finger bewegen nur die Karte. Mit zwei Fingern zoomst du.',
        how: 'Du musst nichts einstellen: Sobald der Apple Pencil das Display berührt, schaltet sich der Stiftmodus ein. Unter „Darstellung“ kannst du ihn auf „Immer“ oder „Aus“ stellen. Liegt die Hand beim Zeichnen auf dem Display, wird sie ignoriert.',
        benefit: 'Du kannst genau zeichnen, ohne dass die Karte wegrutscht, und trotzdem mit dem Finger verschieben und zoomen.',
      },
    ],
  },
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
