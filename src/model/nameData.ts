/**
 * Pre-made names for districts and suburbs. They sound like real German places but are invented, and no two of
 * them start with the same five letters (nameData.test.ts checks this), so "Rotterfeld" and "Rotterhagen" never meet.
 */
export const PLACE_NAMES: string[] = [
  'Abtsrode', 'Achterhain', 'Adlerhorst', 'Ahornfeld', 'Almwiese', 'Altgraben', 'Amselgrund', 'Ankerbucht', 'Apfelhain', 'Arnsdorf', 'Aschwiese', 'Auenheim',
  'Axtbach', 'Amberwald', 'Adelsbrück', 'Albrechtsfeld', 'Angelhof', 'Arkenau', 'Backhaus', 'Bergenau', 'Birkhorst', 'Bischofsheide', 'Blumenrode', 'Bockwiese',
  'Bornsiel', 'Brandau', 'Breitenhain', 'Bruchfeld', 'Buchholm', 'Bürgerwiese', 'Butterfeld', 'Brunnenau', 'Bleckwiese', 'Bernsteinau', 'Bettenfeld', 'Bienenau',
  'Binsenfeld', 'Birnbaumhof', 'Blaubeerau', 'Blütenfeld', 'Bohnenrode', 'Brombeerwinkel', 'Bullenfeld', 'Brückenfeld', 'Bleichenau', 'Bartelsrode', 'Cederfeld', 'Chausseehof',
  'Clarenau', 'Cordelau', 'Calmenrode', 'Cäcilienhain', 'Dachsberg', 'Dammfeld', 'Dahlenrode', 'Distelhof', 'Dornhagen', 'Drosselhain', 'Dünenau', 'Dörnbach',
  'Dreiborn', 'Dohlenau', 'Dahlienhof', 'Damwildau', 'Deichwinkel', 'Dickichtau', 'Dottenfeld', 'Drachenbach', 'Dreschfeld', 'Dudenrode', 'Dellenau', 'Diedrichsfeld',
  'Ebersfeld', 'Eckernau', 'Eichwerda', 'Eisenau', 'Elsterhain', 'Emmerloh', 'Engelsau', 'Erlenfeld', 'Eschenrode', 'Eulenhof', 'Etzenbach', 'Edelweißau',
  'Efeuhain', 'Eiderwiese', 'Eintrachtfeld', 'Eisvogelau', 'Elchenfeld', 'Emsrode', 'Enzianhof', 'Erdbeerau', 'Espenfeld', 'Fasanenhain', 'Fährau', 'Falkenrode',
  'Farnwiese', 'Federbach', 'Feldmark', 'Felsenau', 'Fichtenhorst', 'Finkenwerda', 'Fischerode', 'Flachsau', 'Flammersbach', 'Flößerau', 'Forellenbach', 'Frauenwiese',
  'Frankenfeld', 'Fuchsrode', 'Furtwiese', 'Fackelwiese', 'Fenchelau', 'Ferrenhof', 'Feuerdorn', 'Fliederbach', 'Flurfeld', 'Fohlenau', 'Fördewiese', 'Frühlingsau',
  'Fünfeichen', 'Futterfeld', 'Fleetwinkel', 'Gänsewiese', 'Gartenau', 'Gerstenfeld', 'Giebelau', 'Glockenau', 'Goldbach', 'Gottesrode', 'Grafenwerda', 'Grashof',
  'Grauwinkel', 'Greifenau', 'Grenzbach', 'Grünhain', 'Gutenfeld', 'Gabelbach', 'Galgenfeld', 'Gelbsiel', 'Ginsterau', 'Glasbach', 'Gleisfeld', 'Gnadenfeld',
  'Gösselbach', 'Gradwiese', 'Granatau', 'Griesbach', 'Grillenhof', 'Grubenrode', 'Gundelau', 'Garbenfeld', 'Geiersrode', 'Haberfeld', 'Hagenau', 'Hainfeld',
  'Halmenrode', 'Hammerbach', 'Hasenwinkel', 'Haselbusch', 'Heckenau', 'Heidmark', 'Heimfeld', 'Hellbach', 'Hengstfeld', 'Herbstwiese', 'Hessenrode', 'Hirschau',
  'Hirtenfeld', 'Höhenau', 'Holderbusch', 'Hollerhain', 'Holzmark', 'Honigwiese', 'Hopfenau', 'Hügelfeld', 'Hufenau', 'Hundsrode', 'Habichtsfeld', 'Hafenrode',
  'Hartwiese', 'Hechtbach', 'Heiligenrode', 'Himbeerau', 'Ilsenau', 'Immenfeld', 'Ingelwiese', 'Iserhain', 'Igelrode', 'Irrlichtau', 'Jagdfeld', 'Jägerhof',
  'Jahnsdorf', 'Jasminau', 'Johannisbach', 'Juniwiese', 'Jungfernrode', 'Jochfeld', 'Kählerau', 'Kaiserwiese', 'Kalkfeld', 'Kammerau', 'Kapellenhof', 'Karpfenau',
  'Kastanienhain', 'Katzenbach', 'Keilfeld', 'Kerbenau', 'Kiefernhorst', 'Kiesgrund', 'Kirschenau', 'Kleeberg', 'Klosterfeld', 'Knappenrode', 'Kohlwiese', 'Kornhain',
  'Kranichau', 'Krautwinkel', 'Krebsbach', 'Kreuzfeld', 'Kronwerda', 'Krugwiese', 'Kuckucksau', 'Kuhlenfeld', 'Kupferbach', 'Kurzenau', 'Kämmerlinghof', 'Kolbenau',
  'Lachsbach', 'Lammfeld', 'Langenhain', 'Lärchenau', 'Laubenfeld', 'Lehmkuhle', 'Lerchenhof', 'Lichtenrode', 'Lindenhorst', 'Linsenau', 'Löwenbach', 'Lohfeld',
  'Lüttenau', 'Lupinenfeld', 'Lavendelau', 'Leinfeld', 'Lilienrode', 'Lötzenau', 'Lummerfeld', 'Maifeld', 'Malvenau', 'Mandelbach', 'Marderfeld', 'Marienwiese',
  'Markbach', 'Maulbeerhain', 'Mehlfeld', 'Meisenau', 'Mittenwerda', 'Mohnfeld', 'Moorhain', 'Mühlenrode', 'Mückenbach', 'Muschelau', 'Magerwiese', 'Mäuselfeld',
  'Merlenau', 'Minzbach', 'Mondwiese', 'Morgenrot', 'Möwenhain', 'Nachtigallhain', 'Nadelfeld', 'Nebelwiese', 'Nelkenau', 'Nesselbach', 'Neuwerda', 'Nixenau',
  'Nordfeld', 'Nussbaumhof', 'Narzissenau', 'Nattersrode', 'Nonnenwiese', 'Nordkamp', 'Oberholm', 'Ochsenfeld', 'Ödwiese', 'Ofenbach', 'Ölmühle', 'Ostwerda',
  'Otterfeld', 'Owenau', 'Orchideenau', 'Obstgarten', 'Odenwiese', 'Pappelhain', 'Pfauenfeld', 'Pfeifenrode', 'Pflaumenau', 'Pilzwiese', 'Pirschfeld', 'Plattenau',
  'Pfingstwiese', 'Pastoratsfeld', 'Perlbach', 'Petersrode', 'Pinienhof', 'Preiselbeerau', 'Quellenfeld', 'Quarzbach', 'Quittenau', 'Quendelwiese', 'Querfeld', 'Rabenwiese',
  'Rainfeld', 'Rastenau', 'Rautenbach', 'Rebenhain', 'Rehwinkel', 'Reiherfeld', 'Rennbach', 'Ringelwiese', 'Rittersgrund', 'Roggenau', 'Rosenbusch', 'Rübenfeld',
  'Rudelsbach', 'Rundhof', 'Ruhwiese', 'Rauhfeld', 'Rotkehlchenau', 'Rüsterhain', 'Saatwiese', 'Sandkrug', 'Salbeiau', 'Schafwiese', 'Schilfhain', 'Schlehenau',
  'Schmiedefeld', 'Schneewinkel', 'Schwalbenau', 'Sonnenrode', 'Spatzenhof', 'Spechthain', 'Sperlingsau', 'Sperberhain', 'Steinwerda', 'Sternenfeld', 'Stieglitzau', 'Storchenhain',
  'Strohfeld', 'Südwiese', 'Schäferhain', 'Seidenfeld', 'Silberwiese', 'Sommerrode', 'Springbach', 'Stechpalmenau', 'Strandhof', 'Sumpfhain', 'Tannenhain', 'Taubenau',
  'Teichhof', 'Tiefenbach', 'Torfwiese', 'Trappenfeld', 'Traubenau', 'Triftwiese', 'Tulpenhain', 'Turmfeld', 'Talwinkel', 'Thymianau', 'Tüchelrode', 'Törnwiese',
  'Uferhain', 'Ulmenau', 'Unterholm', 'Urwiese', 'Uhlenhorst', 'Ungerfeld', 'Veilchenau', 'Viehhof', 'Vogelwiese', 'Vierlinden', 'Vennhain', 'Veltenrode',
  'Venusfeld', 'Wachtelau', 'Waldhorst', 'Walnussau', 'Wasserfeld', 'Weberhain', 'Weidenbusch', 'Weißdornau', 'Weizenfeld', 'Wiesenau', 'Wildenrode', 'Windmühlfeld',
  'Winterhain', 'Wolfsgrund', 'Wacholderfeld', 'Wurmbach', 'Wehrfeld', 'Wickenrode', 'Wiedehopfau', 'Wirtsfeld', 'Zaunwinkel', 'Zedernau', 'Ziegelbach', 'Zinnfeld',
  'Zwiebelhof', 'Zwergenau', 'Zeisigau', 'Zimtwiese', 'Zugwiese', 'Behringsfeld', 'Dannenkamp', 'Eckhorst', 'Elmshagen', 'Evershorst', 'Fahrenkamp', 'Fürstenkamp',
  'Gerdhorst', 'Halstenkamp', 'Harmshorst', 'Hasselkamp', 'Ihlenfeld', 'Isenbüttel', 'Lüdersdorf', 'Moorkamp', 'Oldenhorst', 'Osterkamp', 'Soltenhorst', 'Stolzenkamp',
  'Varenhorst', 'Wedelkamp', 'Wellenkamp', 'Westerhorst', 'Wittenkamp', 'Wulfskamp', 'Zeesenkamp', 'Altenbrück', 'Bachwerda', 'Bergwinkel', 'Dorfwerda', 'Dürrwiese',
  'Felswinkel', 'Hochwiese', 'Inselwerda', 'Kleinau', 'Lindwerda', 'Neuhorst', 'Obermark', 'Rotwerda', 'Seewinkel', 'Talhorst', 'Weitenfeld', 'Zentralmark',
  'Amtshof', 'Brauhof', 'Domwiese', 'Fährhof', 'Gutshof', 'Herrenhof', 'Kelterhof', 'Meierhof', 'Pachthof', 'Schulzenhof', 'Vogtshof', 'Zehnthof',
  'Dorotheenau', 'Ernstwinkel', 'Friedrichsrode', 'Gertrudenau', 'Hildegardfeld', 'Ingeborgau', 'Katharinenhain', 'Ludwigsrode', 'Margaretenau', 'Nikolausfeld', 'Ottilienau', 'Philippswiese',
  'Rosalienhof', 'Sophienrode', 'Theresienau', 'Ulrikenhain', 'Wilhelminenau', 'Eichenkamp', 'Buchenhorst', 'Fliesenau', 'Gerberau', 'Hufnerfeld', 'Köhlerrode', 'Küferau',
  'Müllerhain', 'Rademachau', 'Sattlerfeld', 'Töpferrode', 'Zimmerau', 'Ravensfeld', 'Pelzwiese', 'Vellerau', 'Wunderwiese', 'Yachtwinkel', 'Ysselhorst', 'Zabelrode', 'Qualmwiese', 'Opalbach',
]

/** First parts of lake names (all end in "see"); chosen so they do not match a real lake. */
export const LAKE_STEMS: string[] = [
  'Almen', 'Binsen', 'Birken', 'Dunkel', 'Eulen', 'Falken', 'Farn', 'Fischer', 'Frosch', 'Gold', 'Hecht', 'Heide', 'Hirsch', 'Igel', 'Karpfen', 'Kiesel', 'Krähen', 'Lerchen', 'Libellen', 'Linden', 'Mönchs', 'Moor', 'Mühlen', 'Nebel', 'Nixen', 'Otter', 'Pappel', 'Quellen', 'Reiher', 'Rohr', 'Salbei', 'Schilf', 'Schwanen', 'Silber', 'Sonnen', 'Stern', 'Storchen', 'Teufels', 'Tiefen', 'Torf', 'Ulmen', 'Weiden', 'Wolfs', 'Zander', 'Abend', 'Bernstein', 'Dämmer', 'Eisvogel', 'Förster', 'Gänse', 'Haselnuss', 'Jäger', 'Kiefern', 'Lilien', 'Morgen', 'Nussbaum', 'Pilz', 'Rabe', 'Spiegel', 'Wacholder',
]

/** Names of rivers (complete). */
export const RIVER_NAMES: string[] = [
  'Alsbach', 'Birkenach', 'Dörrach', 'Eschenbach', 'Fuchsbach', 'Gänsebach', 'Hirschbach', 'Ilmbach', 'Jägerbach', 'Kupferach', 'Lindach', 'Mühlbach', 'Nesselach', 'Ottersbach', 'Pfeilbach', 'Quellach', 'Rotach', 'Silberbach', 'Tannach', 'Ulmbach', 'Weidenach', 'Zinnbach', 'Auenbach', 'Brunnach', 'Dammbach', 'Erlenbach', 'Forellenach', 'Gerstenach', 'Hainbach', 'Irlach', 'Kieselbach', 'Lerchach', 'Moosach', 'Nussach', 'Obstbach', 'Pappelach', 'Rehbach', 'Schilfach', 'Taubenach', 'Wiesenach', 'Aalach', 'Bärenach', 'Distelbach', 'Elsach', 'Fährbach', 'Glasach', 'Heidenach', 'Igelbach',
]

export const CANAL_NAMES: string[] = [
  'Nordkanal', 'Hafenkanal', 'Mühlenkanal', 'Stadtkanal', 'Ostkanal', 'Handelskanal', 'Schleusenkanal', 'Werftkanal', 'Fleet', 'Kaiserkanal', 'Torfkanal', 'Kohlenkanal', 'Lastenkanal', 'Ringkanal', 'Westkanal', 'Südkanal', 'Umgehungskanal', 'Speicherkanal', 'Fabrikkanal', 'Gartenkanal', 'Marktkanal', 'Brückenkanal', 'Zollkanal', 'Salzkanal',
]

export const SEA_NAMES: string[] = [
  'Nebelmeer', 'Silbermeer', 'Weitmeer', 'Morgenmeer', 'Sturmmeer', 'Möwenmeer', 'Dünenmeer', 'Salzmeer', 'Wellenmeer', 'Leuchtturmsee', 'Nordstrandmeer', 'Bernsteinmeer', 'Ankermeer', 'Seglermeer', 'Gezeitenmeer', 'Windmeer',
]

export const FOREST_NAMES: string[] = [
  'Eichenforst', 'Buchenhain', 'Tannenwald', 'Birkenholz', 'Kiefernheide', 'Erlenbruch', 'Fichtenforst', 'Lärchenwald', 'Ulmenwald', 'Weidenholz', 'Hasselforst', 'Schattenwald', 'Wolfswald', 'Hirschforst', 'Rabenholz', 'Moosforst', 'Farnwald', 'Nebelforst', 'Pilzwald', 'Hainholz', 'Eulenforst', 'Dachswald', 'Fuchsforst', 'Habichtswald', 'Bärenforst', 'Dunkelholz', 'Silberforst', 'Mondwald', 'Waldwinkel', 'Grünholz',
]

export const MOUNTAIN_NAMES: string[] = [
  'Nebelgebirge', 'Silberkamm', 'Adlerberge', 'Grauhorn', 'Steinwand', 'Wolkenjoch', 'Felsenkamm', 'Donnerberge', 'Eisgrat', 'Falkenstock', 'Gipfelhorn', 'Hochkamm', 'Raubkopf', 'Schneehorn', 'Sturmjoch', 'Talkamm', 'Wettergrat', 'Zackenkamm', 'Dämmerberge', 'Granitzug', 'Kupferkamm', 'Morgenhorn', 'Nordgrat', 'Rabenjoch', 'Steinadlerberge', 'Windgrat',
]
