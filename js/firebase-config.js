// ┌─────────────────────────────────────────────────────────────────┐
// │  HIER DEINE FIREBASE-CONFIG EINFÜGEN, DANN TEILEN ALLE 6 HANDYS   │
// │  Solange leer, läuft die App lokal auf DIESEM Gerät (zum Testen). │
// └─────────────────────────────────────────────────────────────────┘
//
// So bekommst du die Werte (einmalig, ~3 Min, kostenlos):
//  1. console.firebase.google.com  →  "Projekt hinzufügen"  → Namen z.B. "usa-reise"
//  2. Im Projekt:  ⚙ Projekteinstellungen → unten "Web-App" (</>-Symbol) hinzufügen
//  3. Firebase zeigt dir ein "firebaseConfig = { ... }" — die Werte hier eintragen.
//  4. Linke Leiste: "Firestore Database" → Datenbank erstellen (Test-/Produktionsmodus)
//  5. Linke Leiste: "Storage" → aktivieren
//  6. "Authentication" → Anmeldeanbieter → "Anonym" aktivieren
//
// Danach: alle öffnen dieselbe URL, registrieren sich einmal — fertig, alles synchron.

export const firebaseConfig = {
  // apiKey: "…",
  // authDomain: "…",
  // projectId: "…",
  // storageBucket: "…",
  // messagingSenderId: "…",
  // appId: "…",
};

export const isConfigured = Object.keys(firebaseConfig).length > 0 && !!firebaseConfig.projectId;
