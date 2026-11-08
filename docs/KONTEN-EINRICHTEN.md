# Konten einrichten (Firebase)

Der Code für Anmeldung und Cloud-Speicher ist fertig. Damit er läuft, braucht LineForge ein Firebase-Projekt.
Solange keine Konfiguration hinterlegt ist, bleibt die App wie bisher ohne Konten (der „Anmelden“-Knopf ist dann ausgeblendet).

## 1. Projekt anlegen
1. <https://console.firebase.google.com> öffnen, **Projekt hinzufügen**, Name z. B. `lineforge`. Google Analytics kann aus bleiben.

## 2. Anmeldearten freischalten
**Build → Authentication → Los geht's → Anmeldemethode**
- **E-Mail/Passwort** aktivieren.
- **Google** aktivieren (eine Support-E-Mail auswählen).
- **Telefon** aktivieren. Zum Testen unter „Telefonnummern zum Testen“ eine Nummer mit festem Code eintragen (verbraucht keine SMS).

**Authentication → Einstellungen → Autorisierte Domains:** `lineforge-app.vercel.app` hinzufügen.

## 3. Datenbank
**Build → Firestore Database → Datenbank erstellen**, Standort in Europa (z. B. `eur3`), **Produktionsmodus**.
Danach den Reiter **Regeln** öffnen, den Inhalt von `firestore.rules` aus diesem Repository einfügen und **Veröffentlichen**.
(Die Regeln erlauben jeder Person nur den Zugriff auf ihre eigenen Städte.)

## 4. Web-App registrieren
**Projekteinstellungen (Zahnrad) → Allgemein → Meine Apps → Web (`</>`)**, Name `LineForge`, **Hosting nicht** anhaken.
Es erscheint ein Block `firebaseConfig = { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId }`.
Diese Werte sind öffentlich gedacht (die Sicherheit kommt aus den Regeln), man darf sie weitergeben.

## 5. Werte hinterlegen
Als Umgebungsvariablen in Vercel (Projekt `lineforge-app`) und lokal in `.env.local`:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```
Danach neu deployen.

## Hinweise
- **SMS:** Das Gratis-Kontingent für SMS ist klein; für mehr braucht Firebase den Blaze-Tarif (Kreditkarte, bezahlt wird nur Verbrauch). Prüfe die aktuellen Preise in der Konsole.
- **Passwort-Mails** kommen von Firebase. Absender und Text lassen sich unter Authentication → Vorlagen anpassen.
- **Cloud-Speicher:** Jede Stadt wird komprimiert unter `users/{uid}/cityData/{id}` abgelegt, die Kurzbeschreibung unter `users/{uid}/cities/{id}`.
