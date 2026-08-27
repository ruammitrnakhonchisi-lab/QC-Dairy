/* ============================================================
   Firebase project configuration.
   Replace the values below with your own project's config
   (Firebase Console → Project settings → General → Your apps → SDK setup).
   These values are safe to embed in client code — they are not
   secret keys; access is controlled by Firestore Security Rules.
   ============================================================ */
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "REPLACE_ME";

if (FIREBASE_CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
}
