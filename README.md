# Ideensammlung Lieder

Eine kleine, moderne Webapp, um anonym Ideen und Stichpunkte für die Lieder zu sammeln — inklusive Like-Funktion und Top-10-Liste. Der gesamte Inhalt liegt unter [`public/`](public/) und ist als statische Seite für **GitHub Pages** gebaut.

## Datenbank (Firebase Firestore)

Da GitHub Pages nur statische Dateien ausliefert, läuft kein eigener Server. Als Datenbank wird stattdessen **Firebase Firestore** direkt aus dem Browser angesprochen:

1. Firebase-Projekt anlegen: https://console.firebase.google.com
2. Im Projekt **Firestore Database** im "Native mode" aktivieren.
3. Unter *Project settings → General → Your apps* eine Web-App hinzufügen und die Konfiguration kopieren.
4. `public/firebase-config.example.js` nach `public/firebase-config.js` kopieren und die Werte eintragen:

   ```js
   window.firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "...",
   };
   ```

5. Firestore-Regeln für dieses anonyme Mini-Projekt (Lesen/Schreiben offen, keine sensiblen Daten):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /posts/{postId} {
         allow read, create: if true;
         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes']);
       }
     }
   }
   ```

`public/firebase-config.js` wird mit committet, damit die auf GitHub Pages deployte, rein statische Seite die Konfiguration laden kann. Das ist unproblematisch: Diese Web-Config (`apiKey`, `projectId` usw.) ist kein Geheimnis, sie ist für die öffentliche Nutzung im Browser gedacht — der eigentliche Schutz läuft über die Firestore-Sicherheitsregeln oben, nicht über Geheimhaltung der Config. Fehlt die Datei (z. B. lokal ohne eigenes Firebase-Projekt), läuft die App automatisch im Fallback-Modus mit `localStorage` im Browser.

## Deployment auf GitHub Pages

Ein GitHub-Actions-Workflow ([`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)) veröffentlicht bei jedem Push auf `main` automatisch den Ordner `public/` auf GitHub Pages.

Einmalig einrichten:

1. Im Repository unter **Settings → Pages** die Source auf **GitHub Actions** stellen.
2. Push auf `main` — der Workflow deployt automatisch.

## Lokal entwickeln

Einfach `public/index.html` im Browser öffnen (Fallback nutzt `localStorage`), oder optional den kleinen Express-Server für dateibasierte Tests starten:

```bash
npm install
npm start
```
