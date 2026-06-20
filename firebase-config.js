import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBbFSD4ZAvL10wslrq8l1ok-pnT6_xzvoA",
  authDomain: "basesoftwarejuh.firebaseapp.com",
  projectId: "basesoftwarejuh",
  storageBucket: "basesoftwarejuh.firebasestorage.app",
  messagingSenderId: "745122021260",
  appId: "1:745122021260:web:ed8d7993d85fc47734e0a9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
