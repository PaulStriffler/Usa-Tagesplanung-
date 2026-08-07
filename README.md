# Striffler · Stief — USA Roadtrip 2026 📍🇺🇸

Familien-App für unseren USA-Roadtrip (02.–18.08.2026). Läuft als **PWA** (auf dem iPhone „Zum Home-Bildschirm" → wie eine echte App, offline nutzbar).

## Was die App kann
- **Intro-Animation** mit eigenem Striffler·Stief-Emblem (American Style).
- **Login/Registrierung**: jede*r der 6 wählt sich aus (Dorothee, Jens, Alex, Hannah, Maxi, Paul) und legt Benutzername + Passwort fest — so ist bei Chat & Fotos immer sichtbar, von wem etwas kommt.
- **Standort-Freigabe** direkt nach dem Login (für „Wo sind wir gerade?" & genaue Foto-Zuordnung).
- **Home**: heutige Tagesplanung (Aufstehzeit, Hotel, km, Aktivitäten), Reiseplan-Übersicht, To-Dos & Ziele, Standort-Ortung, Foto-Upload-Portal.
- **Fotos**: werden beim Hochladen automatisch analysiert (EXIF: GPS + Zeit), nach Ort/Reisetag in **Ordner** einsortiert, Duplikate/Serien erkannt (behält die schärfsten). Jedes Foto zeigt Name · Datum · Ort · Fotograf*in.
- **Familien-Chat** mit Tags 📌 To-do / 📍 Ziel / ⏰ Aufstehzeit — getaggte Nachrichten landen automatisch im Terminplan auf der Startseite.
- **Routenplaner**: Ziele für den nächsten Tag eingeben → schnellste Reihenfolge → fertiger **Google-Maps-Link** mit Wegpunkten.

## Lokal starten
```bash
python3 serve.py
# dann http://localhost:8123 öffnen
```

## Gemeinsam nutzen (alle 6 Handys synchron)
Standardmäßig läuft alles **lokal pro Gerät**. Für echtes Teilen (wie iCloud) einmalig Firebase eintragen — Anleitung steht in [`js/firebase-config.js`](js/firebase-config.js). Danach öffnen alle dieselbe URL, registrieren sich, fertig.

## Technik
Reines HTML/CSS/JS, keine Build-Tools. EXIF via [exifr](https://github.com/MikeKovarik/exifr), Animationen via GSAP, Speicher via IndexedDB/localStorage (lokal) bzw. Firestore + Storage (cloud).
