/* ============================================================
   Firebase project configuration.
   Replace the values below with your own project's config
   (Firebase Console → Project settings → General → Your apps → SDK setup).
   These values are safe to embed in client code — they are not
   secret keys; access is controlled by Firestore Security Rules.
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyDvBB818m8y5ccQxBI2JgBlCoQ_1fjDSUc",
  authDomain: "qc-dairy.firebaseapp.com",
  projectId: "qc-dairy",
  storageBucket: "qc-dairy.firebasestorage.app",
  messagingSenderId: "641509099684",
  appId: "1:641509099684:web:c7a6131bf5a22d5c9b3e31"
};

const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "REPLACE_ME";

if (FIREBASE_CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
}
