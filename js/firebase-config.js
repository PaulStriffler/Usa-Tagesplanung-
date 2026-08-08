// ┌─────────────────────────────────────────────────────────────────┐
// │  Firebase-Config für "usa-reise" — alle 6 Geräte teilen sich      │
// │  dadurch Fotos, Chat, To-Dos & Routen live.                       │
// └─────────────────────────────────────────────────────────────────┘
// Der apiKey ist bei Firebase-Web-Apps bewusst öffentlich — der Schutz
// läuft über die Firestore-/Storage-Regeln, nicht über den Key.

export const firebaseConfig = {
  apiKey: "AIzaSyBE4_BDEfQ6_1wt-Y-lznmN7ey7c7AeBF8",
  authDomain: "usa-reise-dbcd9.firebaseapp.com",
  projectId: "usa-reise-dbcd9",
  storageBucket: "usa-reise-dbcd9.firebasestorage.app",
  messagingSenderId: "123523149267",
  appId: "1:123523149267:web:8931b546c8b0977a4d5326",
  measurementId: "G-3GMXD7BP1M"
};

export const isConfigured = Object.keys(firebaseConfig).length > 0 && !!firebaseConfig.projectId;
