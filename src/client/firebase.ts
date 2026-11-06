import { initializeApp } from "./infrastructure/firebase/app.js";
import { getAuth } from "./infrastructure/firebase/auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "./infrastructure/firebase/firestore.js";

const firebaseConfig = {
  apiKey: "__FIREBASE_WEB_API_KEY__",
  authDomain: "__FIREBASE_WEB_AUTH_DOMAIN__",
  projectId: "__FIREBASE_WEB_PROJECT_ID__",
  storageBucket: "__FIREBASE_WEB_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_WEB_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_WEB_APP_ID__"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// SDK 12 uses Fetch streams for WebChannel by default. Use its XHR transport
// so closing a channel does not abort a Fetch stream in the browser.
const firestoreSettings = {
  useFetchStreams: false,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
};
export const db = initializeFirestore(app, firestoreSettings);
