// ============================================================
// firebase.js — Firebase initialization & helper utilities
// IMPORTANT: Fill in your Firebase project config below.
// The Admin UID is hard-coded here for reference; real access
// control is enforced by Firestore Security Rules (never trust
// client-side checks alone).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  increment,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  onValue,
  push,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// ─── Replace these values with your Firebase project config ───
const firebaseConfig = {
  apiKey: "AIzaSyCOTd4ixSy37In5JyRA2sovp5MEx65u8hM",
  authDomain: "clothingjishop.firebaseapp.com",
  databaseURL: "https://clothingjishop-default-rtdb.firebaseio.com",
  projectId: "clothingjishop",
  storageBucket: "clothingjishop.firebasestorage.app",
  messagingSenderId: "369318489742",
  appId: "1:369318489742:web:cc792deb414e29c2eb23df",
  measurementId: "G-F3FPNBVJS4"
};
// ──────────────────────────────────────────────────────────────

// The ONLY trusted admin identity. Any operation that modifies
// admin-scoped data must also be validated in Firestore Security
// Rules — never rely on this client-side constant alone.
export const ADMIN_UID = "pZ16DY2C8cV2P4S4wd7Z4B6qBKH3";
export const ADMIN_EMAIL = "admin@gmail.com";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  increment,
  writeBatch,
  ref,
  get,
  set,
  update,
  onValue,
  push,
};
