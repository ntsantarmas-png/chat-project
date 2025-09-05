// app.js (MODULAR)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, push, set, onChildAdded, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// --- Firebase Init ---
const firebaseConfig = {
  apiKey: "AIzaSyDii_FqpCDTRvvxjJGTyJPIdZmxfwQcO3s",
  authDomain: "convo-ae17e.firebaseapp.com",
  databaseURL: "https://convo-ae17e-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "convo-ae17e",
  storageBucket: "convo-ae17e.firebasestorage.app",
  messagingSenderId: "1074442682384",
  appId: "1:1074442682384:web:9faa6a60b1b6848a968a95"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

// --- UI refs ---
const statusEl  = document.getElementById("status");
const signInBtn = document.getElementById("signInBtn");
const signOutBtn= document.getElementById("signOutBtn");
const form      = document.getElementById("messageForm");
const input     = document.getElementById("messageInput");
const chatBox   = document.getElementById("chatMessages");
const usersList = document.getElementById("usersList");

// --- Room / Messages refs ---
const ROOM_ID = "global";
const messagesRef = ref(db, `rooms/${ROOM_ID}/messages`);
const usersRef    = ref(db, "users");

// --- Auth handlers ---
signInBtn?.addEventListener("click", async () => {
  signInBtn.disabled = true;
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.error("signInAnonymously error:", e);
  } finally {
    signInBtn.disabled = false;
  }
});

signOutBtn?.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    statusEl.textContent = `Συνδέθηκες (uid: ${user.uid.slice(0,6)}…)`;
    signInBtn.style.display = "none";
    signOutBtn.style.display = "inline-block";
    form.style.display = "grid";

    // presence (απλό demo)
    const uref = ref(db, `users/${user.uid}`);
    set(uref, { name: user.isAnonymous ? "Anon" : "User", ts: Date.now() });

  } else {
    statusEl.textContent = "Δεν έχεις συνδεθεί.";
    signInBtn.style.display = "inline-block";
    signOutBtn.style.display = "none";
    form.style.display = "none";
  }
});

// --- Send message ---
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = (input.value || "").trim();
  if (!text) return;
  const user = auth.currentUser;
  if (!user) return;

  const msg = {
    uid: user.uid,
    name: user.isAnonymous ? "Anon" : "User",
    text,
    ts: Date.now()
  };
  try {
    await set(push(messagesRef), msg);
    input.value = "";
  } catch (err) {
    console.error("DB write error:", err);
  }
});

// --- Live stream messages ---
onChildAdded(messagesRef, (snap) => {
  const m = snap.val();
  appendMessageToUI(m);
});

// --- Users list (presence demo) ---
onValue(usersRef, (snap) => {
  const users = snap.val() || {};
  usersList.innerHTML = "";
  Object.entries(users).forEach(([uid, u]) => {
    const li = document.createElement("li");
    li.textContent = (u && u.name) ? u.name : uid.slice(0,6);
    usersList.appendChild(li);
  });
});

// --- UI helpers ---
function appendMessageToUI(m) {
  if (!chatBox) return;
  const div = document.createElement("div");
  div.className = "message";
  const time = new Date(m?.ts || Date.now()).toLocaleTimeString();
  div.innerHTML = `<strong>${escapeHtml(m?.name || "User")}</strong> <span style="opacity:.6;font-size:12px">(${time})</span><br>${linkify(escapeHtml(m?.text || ""))}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function linkify(text) {
  const rx = /(https?:\/\/[^\s]+)/g;
  return String(text).replace(rx, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}
