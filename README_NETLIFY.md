Netlify deployment and Firebase setup

1. Make the site static and host on Netlify

- The `public` folder is the static site to publish. `netlify.toml` is configured to publish `public`.

2. Persistence with Firebase Firestore

- Create a Firebase project (https://console.firebase.google.com).
- In the project, enable Firestore (in Native mode).
- In Project Settings -> SDK, copy your web config and create `public/firebase-config.js` with:

  window.firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
  };

- Deployment: the frontend will use Firestore for posts/likes when `firebase-config.js` is present.

3. Deploy to Netlify

- Connect repository to Netlify and set build command empty and publish directory `public`, or simply drag & drop `public` in Netlify Drop.

Notes:

- Firestore rules should allow writes/reads for this anonymous app; for production consider securing access.
- Alternatively you can keep the Express server locally for testing; Netlify functions are not included in this setup.
