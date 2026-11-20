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
    version: '0.37.0',
    date: '2026-11-20',
    headline: 'Aktualisieren: Die Anzeige hängt jetzt wirklich im Bahnhof',
    changes: [
      {
        title: 'Zwei Anzeigen an der Decke, wie in Hamburg',
        what: 'Die Tafel liegt nicht mehr flach auf dem Bildschirm, sondern hängt als echtes Doppel-Display von der Decke über dem Bahnsteig: zwei Bildschirme nebeneinander, leicht nach unten geneigt und in zwei Richtungen gedreht, mit grauem Gehäuse und Lüftungsschlitzen. Das Bild ist einer echten S-Bahn-Anzeige nachgebaut: blauer Bildschirm, links „Es folgen / followed by“ mit den nächsten Schritten des Updates und der Uhrzeit, rechts „Nächster Zug / next train“ mit „Neue Version“, der Versionsnummer und dem Status, unten ein heller Infostreifen und „Gleis 1“ auf dem schwarzen Rahmen.',
        how: 'Du musst nichts tun, es erscheint beim Aktualisieren.',
        benefit: 'Es sieht aus wie ein echter U-Bahnhof und nicht mehr wie eine Oberfläche in der App.',
      },
      {
        title: 'Realistischerer Bahnhof',
        what: 'Das blaue Licht der Anzeigen fällt auf Decke und Bahnsteig, der polierte Boden spiegelt die Deckenlampen, die Wand ist gekachelt, und beim Einfahren wirbelt der Zug Staub und Papier auf. Nach dem Halt öffnen sich die Türen, dann startet die App neu.',
        how: 'Du musst nichts tun.',
        benefit: 'Das Warten wird zu einem kleinen Film.',
      },
      {
        title: 'Strafferes Bremsen',
        what: 'Der Zug bremst jetzt in etwa 5 Sekunden bis zum Stillstand.',
        how: 'Du musst nichts tun.',
        benefit: 'Es dauert nicht länger als nötig.',
      },
    ],
  },
  {
    version: '0.36.4',
    date: '2026-11-20',
    headline: 'Aktualisieren: Zug kommt von tief hinten und bremst kürzer',
    changes: [
      {
        title: 'Der Zug fährt wirklich aus dem Tunnel heraus',
        what: 'Der Zug startet jetzt weit hinten im Tunnel, sodass man ihn nie auftauchen sieht. Zuerst wird es im Tunnel durch seine Lichter langsam heller, dann fährt er mit gleichmäßigem Tempo aus dem Tunnel heraus.',
        how: 'Du musst nichts tun.',
        benefit: 'Die Einfahrt wirkt echt, ohne dass der Zug plötzlich da ist.',
      },
      {
        title: 'Kürzeres, strafferes Bremsen',
        what: 'Der Zug bremst jetzt in etwa 5 Sekunden bis zum Stillstand statt in 8 und lässt die Bremse zum Schluss sanft los.',
        how: 'Du musst nichts tun.',
        benefit: 'Das Aktualisieren dauert nicht länger als nötig.',
      },
    ],
  },
  {
    version: '0.36.3',
    date: '2026-11-19',
    headline: 'Aktualisieren: Der Zug hält am Bahnsteig an',
    changes: [
      {
        title: 'Der Zug bremst und bleibt stehen',
        what: 'Die gelbe U-Bahn fährt nicht mehr durchs Bild, sondern kommt aus dem Tunnel, bremst in etwa acht Sekunden von rund 45 km/h ganz sanft ab und hält am Bahnsteig an. Sobald der Zug steht, ist das Aktualisieren vorbei: der Bildschirm wird dunkel und die App startet neu.',
        how: 'Du musst nichts tun.',
        benefit: 'Das Ankommen des Zuges ist das Ende des Ladens, so wie du es dir vorgestellt hast.',
      },
    ],
  },
  {
    version: '0.36.2',
    date: '2026-11-19',
    headline: 'Aktualisieren: Tafel nach dem Vorbild der neuen Hamburger U-Bahn-Anzeigen',
    changes: [
      {
        title: 'Die Anzeige wie über einem echten U-Bahn-Gleis',
        what: 'Die Tafel beim Aktualisieren ist jetzt einer modernen Bahnsteig-Anzeige nachempfunden: tiefblauer Bildschirm in einem grauen Gehäuse, das gelbe Linien-Schild und das Ziel oben, darunter wie bei einer Fahrt „über ...“ die Schritte des Updates, eine dünne Linie und unten die Version und der Status.',
        how: 'Du musst nichts tun. Die Schritte (Suche nach Updates, Speicher leeren, Städte sichern, Neustart) werden nacheinander hervorgehoben, am Ende steht dort „Bitte zurücktreten“.',
        benefit: 'Es sieht aus wie ein echtes Display im Bahnhof und nicht mehr wie eine App-Oberfläche.',
      },
    ],
  },
  {
    version: '0.36.1',
    date: '2026-11-19',
    headline: 'Aktualisieren: Tafel wie im echten Bahnhof',
    changes: [
      {
        title: 'Anzeigetafel wie über einem echten Bahnsteig',
        what: 'Die Tafel beim Aktualisieren sieht jetzt aus wie die Anzeigen an echten Bahnsteigen: ein schwarzer Bildschirm im Stahlrahmen mit Gleis und Uhrzeit oben, dem Linien-Schild, dem Ziel, der Version, dem Status und einer orangen Infozeile. Die Karten-Optik von vorher ist weg.',
        how: 'Du musst nichts tun, sie erscheint beim Aktualisieren.',
        benefit: 'Die Tafel passt zum Bahnhof und wirkt nicht mehr wie ein App-Dashboard.',
      },
    ],
  },
  {
    version: '0.36.0',
    date: '2026-11-19',
    headline: 'Aktualisieren: moderne Tafel und die gelbe U-Bahn',
    changes: [
      {
        title: 'Neue, moderne Anzeigetafel',
        what: 'Die Tafel beim Aktualisieren ist jetzt eine flache, moderne Anzeige: ein Linien-Schild, die große Versionsnummer, Gleis, Status und eine Zeile dazu, was gerade passiert. Die Ziffern und Texte rollen sanft von unten ein, statt wie früher zu klappern.',
        how: 'Du musst nichts tun, sie erscheint beim Aktualisieren.',
        benefit: 'Das Aktualisieren sieht klarer und zeitgemäßer aus.',
      },
      {
        title: 'Die gelbe U-Bahn BLN J / JK fährt ein',
        what: 'Aus dem Tunnel kommt jetzt dieselbe gelbe U-Bahn, die du aus der Fahrzeug-Galerie kennst: drei Wagen mit schwarzen Fenstern und Türen, großer Frontscheibe und hellen Lichtbalken.',
        how: 'Du musst nichts tun, sie fährt beim Aktualisieren von selbst durchs Bild.',
        benefit: 'Der Zug passt zum Rest des Spiels.',
      },
    ],
  },
  {
    version: '0.35.2',
    date: '2026-11-19',
    headline: 'Aktualisieren: kein Blick mehr auf den alten Startbildschirm',
    changes: [
      {
        title: 'Direkt vom Zug zur neuen App',
        what: 'Sobald der Zug vorbeigefahren ist, wird der Bildschirm dunkel und die App startet sofort neu. Vorher blendete der Bildschirm aus, und man sah kurz den alten Startbildschirm, bevor sich die App neu lud.',
        how: 'Du musst nichts tun.',
        benefit: 'Das Aktualisieren wirkt wie ein Stück: Zug, dunkel, neue App.',
      },
    ],
  },
  {
    version: '0.35.1',
    date: '2026-11-19',
    headline: 'Aktualisieren: der Zug kommt wirklich aus dem Tunnel, und du hast Zeit zum Lesen',
    changes: [
      {
        title: 'Zug fährt tief aus dem Tunnel',
        what: 'Der Zug taucht nicht mehr plötzlich am Tunnelrand auf. Zuerst sieht man nur seine Scheinwerfer tief im dunklen Tunnel, die immer größer werden. Alles, was noch hinter der Tunnelwand liegt, ist nur durch die Öffnung zu sehen.',
        how: 'Du musst nichts tun.',
        benefit: 'Der Zug wirkt echt und nicht wie eine Figur, die irgendwo erscheint.',
      },
      {
        title: 'Zwei Sekunden Zeit zum Lesen',
        what: 'Der Zug kommt erst, wenn die ganze Tafel fertig gedreht ist und die LED-Zeile steht. Dann bleiben noch zwei Sekunden Zeit, bevor das Licht aus dem Tunnel kommt.',
        how: 'Du musst nichts tun.',
        benefit: 'Du kannst Version, Gleis und Status in Ruhe lesen.',
      },
    ],
  },
  {
    version: '0.35.0',
    date: '2026-11-19',
    headline: 'Aktualisieren als Abfahrtstafel im Bahnhof',
    changes: [
      {
        title: 'Neuer Aktualisieren-Bildschirm',
        what: 'Beim Aktualisieren siehst du eine Abfahrtstafel mit Klappanzeige in einer Bahnhofshalle. Die Version dreht sich von der alten auf die neue, dazu stehen dort „LineForge“, „Neue Version“, „Gleis 1“ und der Status „Einfahrt“. Eine LED-Zeile zeigt, was die App gerade wirklich tut. Wenn alles bereit ist, steht dort „Pünktlich“, und ein Zug kommt aus dem Tunnel und rauscht durchs Bild. Danach startet die App neu.',
        how: 'Tippe im Menü auf „Aktualisieren“.',
        benefit: 'Du siehst, auf welche Version du wechselst und wann die App fertig ist.',
      },
    ],
  },
  {
    version: '0.34.1',
    date: '2026-11-19',
    headline: 'Der Ladebildschirm zeigt echten Fortschritt',
    changes: [
      {
        title: 'Echter Fortschritt beim Öffnen einer Stadt',
        what: 'Der Ring und die Textzeile am Ladebildschirm folgen jetzt den echten Schritten: Stadt öffnen, Editor aufbauen, Schriften laden, Karte zeichnen. Dauert ein Schritt länger, bleibt der Ring genau dort stehen. Auf schnellen Geräten bleibt der Bildschirm wie bisher mindestens drei Sekunden zu sehen.',
        how: 'Du musst nichts tun.',
        benefit: 'Du siehst, wie weit das Öffnen wirklich ist, auch bei einer großen Stadt.',
      },
    ],
  },
  {
    version: '0.34.0',
    date: '2026-11-19',
    headline: 'Komplett neue Ladebildschirme',
    changes: [
      {
        title: 'Neuer Ladebildschirm für deine Stadt',
        what: 'Ein Umsteigebahnhof baut sich Linie für Linie vor dir auf, während weiche Farben im Hintergrund treiben und Lichter über die Gleise laufen. Ein Ring um den Bahnhof füllt sich, dein Stadtname leuchtet in deiner Akzentfarbe, und darunter steht, woran gerade gearbeitet wird. Wenn alles bereit ist, platzt ein Ring aus dem Bahnhof und das Spiel öffnet sich wie eine Blende.',
        how: 'Du musst nichts tun, der Bildschirm erscheint beim Öffnen einer Stadt.',
        benefit: 'Das Warten sieht nach LineForge aus und passt zu deiner Farbe.',
      },
      {
        title: 'Neuer Aktualisieren-Bildschirm',
        what: 'Beim Aktualisieren der App läuft dieselbe Animation. Am Ende wird der Bahnhof zu einem Haken: „Aktuell!“, dann startet die App neu.',
        how: 'Tippe im Menü auf „Aktualisieren“.',
        benefit: 'Du siehst, dass die App arbeitet und wann sie fertig ist.',
      },
    ],
  },
  {
    version: '0.33.0',
    date: '2026-11-19',
    headline: 'Züge auf den Ladebildschirmen, Löschen mit Nachfrage',
    changes: [
      {
        title: 'Kleine Züge beim Laden',
        what: 'Auf dem Ladebildschirm der Stadt fährt jetzt vor jeder Linie, die gezeichnet wird, ein kleiner Zug in der Farbe der Linie her. Beim Aktualisieren der App fahren die Linien als Züge in die Station in der Mitte ein.',
        how: 'Du musst nichts tun, die Bildschirme erscheinen beim Öffnen einer Stadt und beim Tippen auf „Aktualisieren“.',
        benefit: 'Das Warten sieht nach LineForge aus und nicht nach einem leeren Ladebalken.',
      },
      {
        title: 'Notiz löschen mit Nachfrage',
        what: 'Tippst du in „Idee oder Fehler melden“ auf den Papierkorb, fragt die App erst: „Bist du sicher, dass du es löschen möchtest?“',
        how: 'Mit „Ja, löschen“ ist die Notiz weg, mit „Abbrechen“ bleibt sie.',
        benefit: 'Ein versehentlicher Tipp löscht keine Notiz mehr.',
      },
    ],
  },
  {
    version: '0.32.2',
    date: '2026-11-19',
    headline: 'Konto-Kennung zum Kopieren',
    changes: [
      {
        title: 'Konto-Kennung per Knopf kopieren',
        what: 'Im Fenster „Idee oder Fehler melden“ gibt es neben der Konto-Kennung einen Kopieren-Knopf. Außerdem zeigt die App an, wenn das Senden einer Notiz scheitert, und nennt den Grund.',
        how: 'Fenster öffnen, auf „Kopieren“ tippen und die Kennung in die Firebase-Regeln einfügen.',
        benefit: 'Kein Abtippen mehr, bei dem man „I“ und „l“ verwechselt.',
      },
    ],
  },
  {
    version: '0.32.1',
    date: '2026-11-19',
    headline: 'Verlauf auch beim Titel, genauere Fehlermeldung bei den Ideen',
    changes: [
      {
        title: 'Titel „Forge“ mit Farbverlauf',
        what: 'Das Wort „Forge“ im Titel auf dem Startbildschirm zeigt jetzt den ganzen Farbverlauf, den du bei der Darstellung gewählt hast, und nicht nur die erste Farbe.',
        how: 'Du musst nichts tun.',
        benefit: 'Der Startbildschirm passt zu deinen gewählten Farben.',
      },
      {
        title: 'Ideen-Liste nennt den Grund bei Problemen',
        what: 'Kann die Liste der Ideen nicht geladen werden, steht jetzt der genaue Grund dabei.',
        how: 'Im Fenster „Idee oder Fehler melden“ erscheint die Meldung automatisch.',
        benefit: 'Der Fehler lässt sich schneller finden.',
      },
    ],
  },
  {
    version: '0.32.0',
    date: '2026-11-19',
    headline: 'Ideen und Fehler schnell melden',
    changes: [
      {
        title: 'Idee oder Fehler melden',
        what: 'Fällt dir beim Spielen etwas auf, schreibst du es als einen Satz in die App und sendest es ab. Alle Notizen landen in einer gemeinsamen Liste, die man abhaken und löschen kann.',
        how: 'Auf dem Startbildschirm der Stift-Knopf oben, oder in den Stadt-Einstellungen „Idee oder Fehler melden“. Idee oder Fehler wählen, Satz schreiben, Senden. Ohne Netz oder Anmeldung wartet die Notiz auf dem Gerät und geht später raus.',
        benefit: 'Nichts geht mehr in irgendwelchen Notizen-Apps verloren.',
      },
    ],
  },
  {
    version: '0.31.0',
    date: '2026-11-19',
    headline: 'Neue Straßenbahnen, ICEs und Regionalzüge',
    changes: [
      {
        title: 'Straßenbahnen aus München und Berlin',
        what: 'Sechs Straßenbahnen nach deinen Fotos: in München Avenio, Avenio T, Variobahn und R2.2, in Berlin Flexity und Urbanliner. Mit Zielanzeige, Scheinwerfern, Türen, Faltenbälgen, Stromabnehmer und Drehgestellen.',
        how: 'Linien-Werkzeug, Straßenbahn-Linie antippen, unter „Zug“ das Modell wählen. Alle siehst du in der Fahrzeug-Galerie (#fahrzeuge).',
        benefit: 'Jede Tram-Linie kann wie ein echter Wagen aussehen, in den echten Farben.',
      },
      {
        title: 'ICE 1, ICE 3 und ICE 4',
        what: 'Der Fernverkehr fährt jetzt als ICE 4 (Standard), ICE 3 oder ICE 1 mit langer Nase, rotem Streifen, DB-Logo, Stromabnehmern und fünf Wagen.',
        how: 'Fernverkehr-Linie antippen und unter „Zug“ das Modell wählen.',
        benefit: 'Die Fernzüge sehen aus wie die echten und sind länger, die Bahnsteige wachsen mit.',
      },
      {
        title: 'Nahverkehr: Talent 2, IC 2 KISS, Desiro, ODEG-Desiro und Doppelstock',
        what: 'Fünf neue Regionalzüge, darunter zwei Doppelstockzüge (Škoda-Doppelstock als Standard und IC 2 KISS), mit Zielanzeige, echten Farben und vielen Details.',
        how: 'Nahverkehr-Linie antippen und unter „Zug“ das Modell wählen.',
        benefit: 'Auch der Regionalverkehr hat jetzt echte Vorbilder.',
      },
    ],
  },
  {
    version: '0.30.0',
    date: '2026-11-18',
    headline: 'Neue U-Bahn-Züge',
    changes: [
      {
        title: 'Berliner und Münchner U-Bahnen nach echten Vorbildern',
        what: 'Die U-Bahn gibt es jetzt in mehreren Modellen nach deinen Fotos: Berlin J, H und F-Serie sowie München C2 und A2 (und ein Nürnberger Zug, falls fertig). Alle haben Zielanzeige an der Front, Türen, Fenster, Drehgestelle und Stromschienen-Schleifer.',
        how: 'Linien-Werkzeug, U-Bahn-Linie antippen, unter „Zug“ das Modell wählen. In der Fahrzeug-Galerie (#fahrzeuge, dann U-Bahn) siehst du alle von allen Seiten.',
        benefit: 'Jede U-Bahn-Linie kann wie ein echter Zug aussehen. Die Züge behalten ihre Farben, die Linie steht auf der Zielanzeige.',
      },
    ],
  },
  {
    version: '0.29.0',
    date: '2026-11-18',
    headline: 'Züge behalten ihre echten Farben',
    changes: [
      {
        title: 'Zugfarbe unabhängig von der Linienfarbe',
        what: 'Die Züge tragen jetzt die Farben der echten Züge, nach denen sie gebaut sind, und nicht mehr die Farbe ihrer Linie. Eine rote Linie fährt also zum Beispiel auch mit einer blau-weißen Münchner S-Bahn in Blau-Weiß.',
        how: 'Die Linie erkennst du an der Zielanzeige an der Front (dort steht sie in ihrer Farbe). Wer die Züge lieber in der Linienfarbe sehen will: Darstellung (Palette-Knopf im Menü oder in den Stadteinstellungen) → „Zugfarben“ → „Linienfarbe“.',
        benefit: 'Die Züge sehen aus wie im echten Leben, und du kannst trotzdem jederzeit auf die Linienfarbe umschalten.',
      },
    ],
  },
  {
    version: '0.28.2',
    date: '2026-11-18',
    headline: 'Münchner ET 1420 nach den Fotos',
    changes: [
      {
        title: 'ET 1420 in Blau-Weiß und Grau, mit geneigter Front',
        what: 'Der neue Münchner S-Bahn-Zug gibt es jetzt in zwei Lackierungen: Blau-Weiß wie auf den Fotos (weißer Wagenkasten, dunkle Fenster, großes weißes S auf dem Führerstand) und die bisherige graue. Das Blau ist die Farbe deiner Linie. Die Front ist jetzt wie am Original stark nach hinten geneigt und hat einen dicken silbernen Rahmen um die Scheibe.',
        how: 'Linien-Werkzeug, S-Bahn-Linie antippen, unter „Zug“ „MUC ET 1420 blau“ oder „MUC ET 1420 grau“ wählen.',
        benefit: 'Die Münchner Linie sieht aus wie die echte neue S-Bahn und passt zu deiner Linienfarbe.',
      },
    ],
  },
  {
    version: '0.28.1',
    date: '2026-11-18',
    headline: 'Feinschliff an den S-Bahnen',
    changes: [
      {
        title: 'Näher am Vorbild',
        what: 'Die Front der BR 484 ist kürzer und steiler, die Frontscheibe größer und die Fensterreihe höher, wie auf den Fotos. Die Scheinwerfer der BR 481 und der Münchner BR 423 sind jetzt rund und warmweiß statt eckig.',
        how: 'Zu sehen in der 3D-Ansicht und in der Fahrzeug-Galerie. Die Galerie lässt sich auch mit einer Adresse wie #fahrzeuge?m=481&view=front direkt auf ein Modell und eine Ansicht stellen.',
        benefit: 'Die Züge sehen echter aus, auch aus der Nähe.',
      },
    ],
  },
  {
    version: '0.28.0',
    date: '2026-11-18',
    headline: 'Zugmodell pro Linie wählen',
    changes: [
      {
        title: 'Welcher Zug auf einer Linie fährt',
        what: 'Jede S-Bahn-Linie kann jetzt mit einem eigenen Zugmodell fahren: Berlin BR 484, Berlin BR 481, München BR 423 oder München ET 1420.',
        how: 'Wähle das Linien-Werkzeug und tippe eine S-Bahn-Linie an. Unter den Farben steht „Zug“ mit den Modellen zur Auswahl. Die Wahl gilt sofort in der 3D-Ansicht und bleibt mit der Stadt gespeichert.',
        benefit: 'Du kannst jede Linie so aussehen lassen, wie du sie dir vorstellst, zum Beispiel eine Linie mit den alten Berliner und eine mit den neuen Münchner Zügen.',
      },
    ],
  },
  {
    version: '0.27.0',
    date: '2026-11-18',
    headline: 'Drei weitere S-Bahn-Modelle',
    changes: [
      {
        title: 'S-Bahn Berlin BR 481, München BR 423 und ET 1420',
        what: 'Neben der neuen Berliner BR 484 gibt es jetzt die klassische rot-gelbe BR 481 aus Berlin sowie zwei Münchner Züge: die rote BR 423 und den neuen grauen ET 1420. Alle haben Zielanzeige, Scheinwerfer, Türen, Fenster, Dachgeräte und Drehgestelle nach den Vorbildern.',
        how: 'Öffne die Fahrzeug-Galerie (Adresse mit #fahrzeuge), wähle S-Bahn und tippe oben auf das gewünschte Modell. „Kopf“ zeigt die Front.',
        benefit: 'Du siehst die Züge in Ruhe von allen Seiten. Welche Linie mit welchem Modell fährt, lässt sich bald im Spiel einstellen; bis dahin fahren alle S-Bahnen als BR 484.',
      },
    ],
  },
  {
    version: '0.26.0',
    date: '2026-11-18',
    headline: 'Neue S-Bahn nach Berliner Vorbild',
    changes: [
      {
        title: 'S-Bahn BR 484 mit Zielanzeige',
        what: 'Die S-Bahn sieht jetzt aus wie die neue Berliner Baureihe 484: cremefarbener Wagenkasten, roter Sockel in der Linienfarbe, große schwarze Frontscheibe, LED-Scheinwerfer, DB-Logo, Lüftungsgitter und Kupplung, dazu Türen und Fenster mit Rahmen, Klimageräte auf dem Dach und Drehgestelle mit Rädern.',
        how: 'Oben an der Frontscheibe steht eine Zielanzeige: links die Linie in ihrer Farbe, rechts das Ziel, also die Endstation in Fahrtrichtung (bei einer Ringlinie „Ring“). Am Endbahnhof wechselt sie, wenn der Zug umdreht. In der Fahrzeug-Galerie (#fahrzeuge) kannst du dir den Zug von allen Seiten ansehen.',
        benefit: 'Man erkennt schon von Weitem, welche Linie kommt und wohin sie fährt.',
      },
    ],
  },
  {
    version: '0.25.2',
    date: '2026-11-18',
    headline: 'Konto und Darstellung getrennt',
    changes: [
      {
        title: 'Farben nur noch unter „Darstellung“',
        what: 'Akzentfarben und Verläufe lassen sich nur noch im Darstellungs-Fenster einstellen. Im Konto stehen nur noch dein Name, die Anmeldung, der Abgleich deiner Städte und das Abmelden.',
        how: 'Tippe auf dem Startbildschirm auf den Darstellungsknopf (Palette), um Farben, Hell/Dunkel und Stift-Modus zu ändern.',
        benefit: 'Jede Einstellung hat genau einen Platz.',
      },
    ],
  },
  {
    version: '0.25.1',
    date: '2026-11-18',
    headline: 'Ausläufer in der Farbe der Hauptlinie',
    changes: [
      {
        title: 'Ausläufer mit hellem Streifen',
        what: 'Ein Ausläufer trägt jetzt immer die Farbe seiner Hauptlinie. Solange er auf der gemeinsamen Strecke fährt, ist er einfach die Hauptlinie. Sobald er sich von ihr trennt, läuft ein heller Streifen in der Mitte der Linie mit, an dem du ihn als Ausläufer erkennst.',
        how: 'Du musst nichts tun. Der Streifen erscheint auf der Karte und im Netzplan von selbst, wo der Ausläufer abzweigt.',
        benefit: 'Der Ausläufer sieht aus wie ein Teil der Hauptlinie und nicht wie eine ganz andere Linie.',
      },
    ],
  },
  {
    version: '0.25.0',
    date: '2026-11-18',
    headline: 'Ausläufer, Umriss zeichnen, Verbindungen nach außerhalb',
    changes: [
      {
        title: 'Ausläufer zwischen zwei Stationen',
        what: 'Ein Ausläufer wird jetzt zwischen zwei Stationen der Hauptlinie angelegt: Du sagst, wo er beginnt und wo er abzweigt. Dazwischen fährt er genau auf der Strecke der Hauptlinie, auf der Karte und im Netzplan als ein und dieselbe Linie und nicht daneben. Er heißt wie die Hauptlinie plus eine Ziffer von 0 bis 9 (S70, S71, S72 ...).',
        how: 'Wähle die Hauptlinie, tippe auf „Ausläufer“, dann zuerst die Station, an der der Ausläufer beginnt, und danach die Station, an der er abzweigt. Von dort ziehst du weiter oder lässt ihn dort enden.',
        benefit: 'So entstehen Linien wie die S7 und die S75 in Berlin: gemeinsame Strecke, dann gehen sie getrennte Wege.',
      },
      {
        title: 'Kreuzende Linien bleiben getrennt',
        what: 'Linien, die sich nur kreuzen, werden nicht mehr zu einer gemeinsamen Strecke zusammengelegt. Nur Linien, die wirklich nebeneinander herfahren, bilden ein Bündel.',
        how: 'Du musst nichts tun.',
        benefit: 'Kreuzungen sehen auf der Karte sauber aus.',
      },
      {
        title: 'Stadt löschen gilt auf allen Geräten',
        what: 'Löschst du eine Stadt auf einem Gerät, verschwindet sie beim nächsten Abgleich auch auf allen anderen Geräten, auf denen du angemeldet bist. Hast du sie dort inzwischen weiterbearbeitet, bleibt sie dort erhalten.',
        how: 'Du musst nichts tun. Beim Zurückkehren in die App wird gleich abgeglichen. Ein Löschen ohne Netz wird nachgeholt, sobald du wieder online bist.',
        benefit: 'Gelöschte Städte kommen nicht mehr von einem anderen Gerät zurück.',
      },
      {
        title: 'Karte vergrößern oder verkleinern ohne verzerrte Straßen',
        what: 'Die Straßen bleiben beim Vergrößern und Verkleinern genau da, wo sie waren, und das Straßennetz wächst in den neuen Randbereichen mit. Auch die Namen der Gewässer wandern jetzt mit.',
        how: 'In den Einstellungen der Stadt die Kartengröße ändern.',
        benefit: 'Linien, die du auf Straßen gelegt hast, passen nach dem Vergrößern weiter zur Stadt.',
      },
      {
        title: 'Liniennamen an den Endstationen',
        what: 'An jedem Ende einer Linie sitzt auf der Karte ein farbiges Schild mit dem Linienamen, wie im Netzplan. Enden mehrere Linien an einer Station, stehen die Schilder in einer Reihe.',
        how: 'Zoome etwas näher heran, dann erscheinen die Schilder.',
        benefit: 'Du siehst auf einen Blick, welche Bahnen wo enden.',
      },
      {
        title: 'Verbindung nach außerhalb am Kartenrand',
        what: 'Endet eine Regional- oder Fernverkehrslinie am Kartenrand, kannst du die Endstation als „Verbindung nach außerhalb“ festlegen. Wird die Karte größer, fragt das Spiel, ob die Linie bis zum neuen Kartenrand weitergeführt werden soll.',
        how: 'Zeichne die Linie bis an den Rand, wähle die Linie und tippe auf „Verbindung nach außerhalb“ (oder wähle die Station am Rand). Beim Vergrößern erscheint die Frage unten.',
        benefit: 'Deine Linien führen wirklich aus der Karte hinaus und wachsen mit der Karte mit.',
      },
      {
        title: 'Gebiete per gezeichnetem Umriss',
        what: 'Neben dem Pinsel gibt es jetzt „Umriss zeichnen“: Du fährst mit dem Finger oder Stift einmal um die Fläche, beim Loslassen wird der Umriss geschlossen und alles darin gefüllt. Der dicke Rand um die Gebiete, der bisher „Umriss“ hieß, entfällt.',
        how: 'Wähle ein Gebiets-Werkzeug (Stadt, Vorort, Flughafen, Wald, Gebirge oder den Radierer) und schalte oben auf „Umriss zeichnen“.',
        benefit: 'Genaue Formen ohne mühsames Ausmalen.',
      },
    ],
  },
  {
    version: '0.24.4',
    date: '2026-11-17',
    headline: 'Kein Konfetti mehr nachts',
    changes: [
      {
        title: 'Bunte Punkte um die Bahnhöfe behoben',
        what: 'Nachts erschienen auf dem iPhone bunte Pünktchen im warmen Lichtschein rund um die Bahnhöfe. Der Lichtschein wird jetzt ohne Transparenz gezeichnet, dadurch bleibt er sauber und ruhig.',
        how: 'Du musst nichts tun. Stelle in 3D die Tageszeit auf Abend oder Nacht.',
        benefit: 'Die Stadt sieht nachts auch auf dem iPhone sauber aus.',
      },
    ],
  },
  {
    version: '0.24.2',
    date: '2026-11-17',
    headline: 'Ruhigere Stadt bei Nacht',
    changes: [
      {
        title: 'Weniger Konfetti nachts',
        what: 'Die Fenster der Häuser verschmelzen aus der Ferne früher zu einem ruhigen warmen Schimmer, statt als einzelne bunte Punkte auf dem Boden zu funkeln. Die blauen Fenster sind jetzt ebenfalls warm.',
        how: 'Du musst nichts tun. Stelle in 3D die Tageszeit auf Abend oder Nacht und schau auf die Stadt.',
        benefit: 'Die Stadt wirkt nachts ruhig und stimmig, besonders auf dem iPhone.',
      },
    ],
  },
  {
    version: '0.24.1',
    date: '2026-11-17',
    headline: 'Bahnhöfe leuchten nachts',
    changes: [
      {
        title: 'Beleuchtete Bahnhofsfenster',
        what: 'Nachts leuchten jetzt die Fenster der Empfangsgebäude warm von innen, die Uhr am Bahnhofsturm strahlt, und Glashallen, Oberlichter und Zelt-Bahnhöfe glimmen sanft.',
        how: 'Du musst nichts tun. Stelle in 3D die Tageszeit auf Abend oder Nacht, zum Beispiel mit dem Zeit-Rad oben auf der Uhr.',
        benefit: 'Bahnhöfe sind im Dunkeln gut zu erkennen und wirken belebt, statt als dunkle Klötze unterzugehen.',
      },
    ],
  },
  {
    version: '0.24.0',
    date: '2026-11-17',
    headline: 'Die Tageszeit selbst einstellen',
    changes: [
      {
        title: 'Tageszeit-Rad',
        what: 'Im Kreativ-Modus kannst du die Spielzeit selbst bestimmen: Ein Ring zeigt den ganzen Tag, darauf wandert eine Sonne und nachts ein Mond.',
        how: 'Tippe oben in der Leiste auf die Uhr. Ziehe die Sonne um den Ring oder wähle Morgen, Mittag, Abend oder Nacht. Mit „Fertig“ geht es zurück, danach läuft die Zeit normal weiter.',
        benefit: 'Du holst dir Sonnenaufgang, Mittagslicht oder Nacht mit leuchtenden Fenstern genau dann, wenn du sie sehen oder fotografieren willst. In 3D folgen Himmel und Licht sofort.',
      },
    ],
  },
  {
    version: '0.23.0',
    date: '2026-11-16',
    headline: 'Karte verkleinern mit Vorschau',
    changes: [
      {
        title: 'Karte verkleinern',
        what: 'Neben „Karte vergrößern“ gibt es jetzt Knöpfe zum Verkleinern. Dabei bleibt die Mitte der Karte, alles außerhalb wird gelöscht.',
        how: 'Stadt-Einstellungen öffnen und „Auf N×N verkleinern“ wählen. Du siehst in 3D einen rot atmenden Bereich, der gelöscht würde. Unten steht, was verloren geht, und du bestätigst oder brichst ab.',
        benefit: 'Du kannst zu große Karten wieder kleiner machen und siehst vorher genau, was verschwindet. Rückgängig holt die alte Karte zurück.',
      },
    ],
  },
  {
    version: '0.22.0',
    date: '2026-11-16',
    headline: 'Die Stadt öffnet sich, wie du sie verlassen hast',
    changes: [
      {
        title: 'Ansicht wird gemerkt',
        what: 'Zoom und Ausschnitt der Karte und die Kamera in 3D werden pro Stadt gemerkt. Öffnest du die Stadt wieder, schaust du genau dorthin, wo du aufgehört hast, statt dass sie neu in die Mitte gesetzt wird.',
        how: 'Du musst nichts tun. Zoome oder verschiebe die Karte, drehe die 3D-Kamera und verlasse die Stadt oder wechsle die Ansicht: Beim nächsten Öffnen ist alles wie vorher. „Zentrieren“ stellt die Übersicht wieder her.',
        benefit: 'Du musst dich nach jedem Öffnen nicht mehr neu hinzoomen.',
      },
      {
        title: 'Normaler Modus ist noch gesperrt',
        what: 'Der Normale Modus ist noch nicht fertig. Neue Städte starten jetzt im Kreativ-Modus, und „Normal“ lässt sich nicht mehr anwählen.',
        how: 'Tippst du in „Neue Stadt“ oder in den Stadt-Einstellungen auf „Normal“, wackelt die Auswahl rot, und ein Hinweis „Beta“ blendet kurz ein und wieder aus.',
        benefit: 'Du kannst nicht mehr versehentlich in einem Modus landen, der noch nichts Eigenes kann.',
      },
    ],
  },
  {
    version: '0.21.2',
    date: '2026-11-16',
    headline: 'Schnelleres Speichern in der Cloud',
    changes: [
      {
        title: 'Kein Warten mehr beim Verlassen einer Stadt',
        what: 'Deine Stadt wird schon beim Spielen immer wieder gesichert: auf dem Gerät nach jeder Änderung, in der Cloud kurz nach der letzten Änderung und bei längerem Spielen spätestens alle 15 Sekunden. Beim Verlassen der Stadt, beim Wechsel in eine andere App, beim Schließen und beim Aktualisieren geht der letzte Stand sofort in die Cloud, statt erst noch einige Sekunden zu warten.',
        how: 'Du musst nichts tun. Der Punkt am Konto-Knopf im Menü zeigt weiter an, ob noch etwas unterwegs ist (gelb) oder alles gesichert ist (grün). Er sollte jetzt viel schneller grün werden.',
        benefit: 'Du kannst die Stadt verlassen und direkt schließen oder aktualisieren, ohne zu warten, und verlierst nichts.',
      },
    ],
  },
  {
    version: '0.21.1',
    date: '2026-11-16',
    headline: 'Unterirdische Strecken bleiben unten, wo sie sich kreuzen',
    changes: [
      {
        title: 'Gleise folgen dem unterirdischen Bahnhof',
        what: 'Kreuzte eine Strecke im Tunnel eine andere, wurde sie über die ganze Länge zurück an die Oberfläche gehoben. Der Bahnhof lag dann zwar unter der Erde, die Gleise aber oben, und die Züge hielten oben ohne Bahnhof.',
        how: 'Du musst nichts tun. Lade die Stadt einfach neu: Die Gleise tauchen jetzt zum unterirdischen Bahnhof ab, fahren im Tunnel und kommen hinter ihm wieder hoch.',
        benefit: 'Unterirdische Bahnhöfe, zum Beispiel am Flughafen, funktionieren auch, wenn sich Linien in der Tiefe kreuzen.',
      },
    ],
  },
  {
    version: '0.21.0',
    date: '2026-11-16',
    headline: 'Sehenswürdigkeiten verschieben, Straßenbahn auf Straßen, Flughafen am Stadtrand',
    changes: [
      {
        title: 'Sehenswürdigkeiten verschieben',
        what: 'Stadien, Attraktionen und Wahrzeichen lassen sich jetzt auf der Karte an eine andere Stelle ziehen. Außerdem stehen sie in 3D nicht mehr mitten in einem Bahnhof: Was auf einer Station lag, rückt von selbst daneben, und neue Sehenswürdigkeiten, die du auf eine Station setzt, ebenfalls.',
        how: 'Unter „Sehenswürdigkeiten“ die Sehenswürdigkeit antippen und mit dem Finger oder der Maus verschieben. „Rückgängig“ holt sie zurück. Ältere Städte werden beim Öffnen einmal aufgeräumt.',
        benefit: 'Du musst nichts mehr löschen und neu setzen, und die Gebäude stehen nicht mehr im Weg der Züge.',
      },
      {
        title: 'Straßenbahn auf den Straßen',
        what: 'Eine Straßenbahn folgt den Straßen der Stadt. Neu: Auch ein grob gezogener Strich von Straße zu Straße wird auf die Straßen gelegt, solange der Weg nicht viel länger wäre. Für bestehende Linien gibt es einen eigenen Knopf.',
        how: 'Eine Straßenbahn-Linie wählen und „Auf Straßen legen“ antippen. Dann liegt die ganze Linie auf den weißen Straßen statt schräg über die Häuserblöcke. Einzelne Abschnitte legst du mit „Abschnitt neu verlegen“ neu.',
        benefit: 'Die Straßenbahn sieht aus wie in einer echten Stadt, und die Stationen sitzen an Straßen.',
      },
      {
        title: 'Flughafen passt sich der Stadt an',
        what: 'Hast du eine Stadt über den Rand eines Flughafens gemalt, endet der Flughafen jetzt dort. Start- und Landebahnen, Terminal und Gebäude bleiben auf seinem eigenen Gelände, statt in die Stadt hineinzuragen.',
        how: 'Du musst nichts tun. Male den Bezirk oder Vorort einfach über den Rand, der Flughafen zieht sich von selbst zurück.',
        benefit: 'Flughafen und Stadt können ohne Nacharbeit direkt aneinandergrenzen.',
      },
    ],
  },
  {
    version: '0.20.1',
    date: '2026-11-16',
    headline: 'Fehler beim Malen von Gebirge, Wald und Landkreisen behoben',
    changes: [
      {
        title: 'Kein schwarzer Bildschirm mehr beim Malen',
        what: 'Sobald man mit dem Gebirge-, Wald- oder Landkreis-Werkzeug über die Karte fuhr, wurde der Bildschirm schwarz und die Karte war weg.',
        how: 'Du musst nichts tun: Aktualisiere die App („Aktualisieren“ im Menü), dann kannst du wie gewohnt malen. Der Pinsel zeigt jetzt auch für diese Werkzeuge einen farbigen Kreis.',
        benefit: 'Gebirge, Wälder und Landkreise lassen sich wieder ganz normal zeichnen.',
      },
    ],
  },
  {
    version: '0.20.0',
    date: '2026-11-16',
    headline: 'Erhöhte und abgesenkte Bahnhöfe',
    changes: [
      {
        title: 'Bahnhöfe auf dem Viadukt',
        what: 'Ein Bahnhof kann jetzt hoch über dem Boden liegen. Seine Bahnsteige stehen auf Pfeilern, und die Gleise davor und dahinter steigen auf einen Damm mit Bögen.',
        how: 'Station antippen und bei „Lage“ (Karte oder 3D-Bahnhofseditor) „Erhöht“ wählen. Die Strecke zu diesem Bahnhof wird von selbst zum Damm; willst du sie anders, tippst du in 3D den Abschnitt an und stellst ihn um.',
        benefit: 'Stadtbahnen über den Straßen, Hochbahnen wie in großen Metropolen und freie Fahrt über Kreuzungen sind möglich.',
      },
      {
        title: 'Abgesenkte Bahnhöfe',
        what: 'Ein Bahnhof kann auch in einem offenen Einschnitt liegen: unter dem Boden, aber ohne Tunneldecke. Das Gelände wird um die Gleise herum ausgehoben.',
        how: 'Station antippen und bei „Lage“ „Abgesenkt“ wählen. Mit „Ebenerdig“ und „Unterirdisch“ wählst du die anderen Lagen, so wie vorher den Tunnel.',
        benefit: 'Du hast vier Lagen zur Auswahl und kannst Bahnhöfe passend zur Landschaft bauen, zum Beispiel in einem Tal oder an einem Hang.',
      },
    ],
  },
  {
    version: '0.19.0',
    date: '2026-11-16',
    headline: 'Dom, Kirche, Rathaus, Friedhof und Schloss',
    changes: [
      {
        title: 'Fünf neue Wahrzeichen',
        what: 'Zu Stadttor und Uhrturm kommen fünf Gebäude hinzu, die jede Stadt prägen: ein Dom mit zwei Türmen, eine Dorfkirche, ein Rathaus mit Turm und Fahnen, ein Friedhof mit Mauer, Kapelle und Grabsteinen sowie ein Schloss mit Mauer, Ecktürmen und Bergfried.',
        how: 'Unter „Sehenswürdigkeiten“ ein Wahrzeichen setzen, antippen und bei „Aussehen in 3D“ das Gebäude wählen. In der 3D-Ansicht stehen sie dann an dieser Stelle, und nachts leuchten ihre Fenster.',
        benefit: 'Deine Stadt bekommt ein erkennbares Zentrum, und die Stationen daneben haben ein Ziel, zu dem die Leute fahren.',
      },
    ],
  },
  {
    version: '0.18.0',
    date: '2026-11-16',
    headline: 'Anschluss an die weite Welt',
    changes: [
      {
        title: 'Anschluss nach außen',
        what: 'Eine Bahn-Haltestelle kann jetzt die Verbindung deiner Stadt zur Außenwelt sein. Sie bekommt ein fernes Ziel, zum Beispiel „Nordhafen“, das auf der Karte und im Netzplan hinter dem Stationsnamen steht („Hauptbahnhof → Nordhafen“).',
        how: 'Eine Bahn-Haltestelle antippen und „Anschluss nach außen“ wählen. Das Ziel wird ausgedacht, du kannst es daneben umbenennen. Nur Regional- und Fernverkehr dürfen dort halten; S-Bahn, U-Bahn und Tram werden abgelehnt. Solange so eine Linie noch dort hält, siehst du einen Hinweis und kannst den Anschluss nicht anschalten.',
        benefit: 'Deine Stadt hängt sichtbar am Rest der Welt, und du erkennst sofort, wo Reisende ankommen und abfahren.',
      },
    ],
  },
  {
    version: '0.17.0',
    date: '2026-11-16',
    headline: 'Landkreise für große Karten',
    changes: [
      {
        title: 'Landkreise',
        what: 'Ein Landkreis fasst mehrere Städte und Vororte zu einer größeren Region mit eigenem Namen und eigener Farbe zusammen. Auf der Karte siehst du ihn als sanft eingefärbte Fläche mit gestricheltem Rand und großem Namen.',
        how: 'Unter „Gebiete“ den Reiter „Landkreis“ wählen und mit dem Finger oder Stift malen. „Neuer Landkreis“ legt einen weiteren an, Name, Farbe und Würfeln des Namens findest du darunter, der Radierer nimmt Felder wieder weg. Der Name kommt zuerst aus deinen Namenswünschen („Landkreise“), sonst wird einer ausgedacht.',
        benefit: 'Auf großen Karten behältst du den Überblick, und deine Welt wirkt wie ein richtiges Land mit Regionen.',
      },
      {
        title: 'Automatisch einteilen',
        what: 'Das Spiel kann das Land selbst in gleich große Landkreise teilen. Wasser bleibt dabei draußen.',
        how: 'Im Landkreis-Reiter die Anzahl (2 bis 12) wählen und „Einteilen“ tippen. Die bisherigen Landkreise werden ersetzt, mit „Rückgängig“ holst du sie zurück.',
        benefit: 'Mit einem Tipp hast du eine sinnvolle Einteilung, die du danach von Hand nachmalen kannst.',
      },
    ],
  },
  {
    version: '0.16.0',
    date: '2026-11-16',
    headline: 'Riesige Karten und fertige Landschaften',
    changes: [
      {
        title: 'Riesige Karte',
        what: 'Zu Klein, Mittel und Groß gibt es jetzt „Riesig“ mit 512 × 512 Feldern, genug Platz für mehrere Städte nebeneinander.',
        how: 'Beim Gründen einer Stadt die Kartengröße „Riesig“ wählen. Eine bestehende Stadt lässt sich in den Stadt-Einstellungen vergrößern.',
        benefit: 'Auch auf der größten Karte läuft die 3D-Ansicht flüssig.',
      },
      {
        title: 'Fertige Landschaften',
        what: 'Neue Städte können mit einer fertigen Landschaft starten: Seenland, Flusstal, Küste, Inseln oder Bergland. Seen, Flüsse und Meer sind schon da, dazu Wälder und Gebirge mit eigenen Namen.',
        how: 'Beim Gründen unter „Landschaft“ eine Art wählen. Das Vorschaubild zeigt, wie die Karte aussieht. „Andere Karte würfeln“ gibt eine neue Variante derselben Art. Die Namen kommen aus deiner Namens-Wunschliste, sonst sind sie ausgedacht.',
        benefit: 'Du musst nicht bei einer leeren Wiese anfangen, und jede Stadt sieht anders aus.',
      },
    ],
  },
  {
    version: '0.15.0',
    date: '2026-11-16',
    headline: 'Jede Stadt mit eigenem Straßenbild',
    changes: [
      {
        title: 'Straßenraster pro Bezirk und Vorort',
        what: 'Bezirke und Vororte können jetzt ihr eigenes Straßenbild haben: gewachsen (wie bisher), Schachbrett mit lauter geraden Straßen, dicht mit kleinen Blöcken, weitläufig mit großen Blöcken oder Strahlen, bei denen die Straßen auf die Kartenmitte zulaufen.',
        how: 'Unter Gebiete einen Bezirk oder Vorort wählen, dann unter „Straßenbild“ den Stil antippen. „Anderes Muster“ würfelt ein neues Aussehen im gleichen Stil, so sehen zwei Städte mit dem gleichen Stil trotzdem verschieden aus.',
        benefit: 'Mehrere Städte auf einer Karte wirken wie verschiedene Orte. Karte, 3D-Häuser und die Strecken der Straßenbahn richten sich nach dem Straßenbild. Bestehende Städte bleiben genau wie sie sind.',
      },
    ],
  },
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
