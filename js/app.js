// Parea Baseline v1 • app.js
(() => {
  const cfg = window.PAREA_CONFIG;
  firebase.initializeApp(cfg.firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.database();

  // DOM
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
  const authScreen = $('#authScreen');
  const app = $('#app');
  const tabs = $$('.tab');
  const loginForm = $('#loginForm');
  const regForm = $('#registerForm');
  const authError = $('#authError');
  const anonBtn = $('#anonBtn');
  const logoutBtn = $('#logoutBtn');

  const roomsList = $('#roomsList');
  const newRoomBtn = $('#newRoomBtn');
  const messages = $('#messages');
  const messageInput = $('#messageInput');
  const sendBtn = $('#sendBtn');
  const emojiBtn = $('#emojiBtn');
  const gifBtn = $('#gifBtn');
  const emojiPicker = $('#emojiPicker');
  const roomNameEl = $('#currentRoomName');
  const roomStatsEl = $('#roomStats');
  const usersList = $('#usersList');

  let currentRoomId = null;
  let presenceRef = null;
  let msgsRef = null;
  let msgsListener = null;

  // Tabs
  tabs.forEach(t => t.addEventListener('click', () => {
    tabs.forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    $$('.auth-form').forEach(f => f.classList.remove('active'));
    (tab === 'login' ? loginForm : regForm).classList.add('active');
    authError.textContent = '';
  }));

  // Auth handlers
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    try {
      await auth.signInWithEmailAndPassword($('#loginEmail').value.trim(), $('#loginPassword').value);
    } catch (err) {
      authError.textContent = err.message;
    }
  });

  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    try {
      const email = $('#regEmail').value.trim();
      const pass = $('#regPassword').value;
      const displayName = $('#regDisplayName').value.trim() || email.split('@')[0];
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      await cred.user.updateProfile({ displayName });
    } catch (err) {
      authError.textContent = err.message;
    }
  });

  anonBtn.addEventListener('click', async () => {
    authError.textContent = '';
    try { await auth.signInAnonymously(); }
    catch (err) { authError.textContent = err.message; }
  });

  logoutBtn.addEventListener('click', async () => {
    await auth.signOut();
  });

  // Emoji picker (simple static set)
  const EMOJIS = "😀 😁 😂 🤣 😊 😉 😍 😘 🤩 🙃 🥳 🤗 😎 🤔 🙏 👍 👎 👋 👀 💬 ❤️ 🔥 🎉 ⭐ 🚀 🎧 🍕 ☕ 🥤 🐶 🐱 🌙 ☀️ 🌈 ⚽ 🎮".split(' ');
  function renderEmojiPicker() {
    emojiPicker.innerHTML = '';
    EMOJIS.forEach(e => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = e;
      btn.addEventListener('click', () => {
        messageInput.value += e;
        emojiPicker.classList.add('hidden');
        messageInput.focus();
      });
      emojiPicker.appendChild(btn);
    });
  }
  renderEmojiPicker();
  emojiBtn.addEventListener('click', () => {
    emojiPicker.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!emojiPicker.classList.contains('hidden') && !emojiPicker.contains(e.target) && e.target !== emojiBtn) {
      emojiPicker.classList.add('hidden');
    }
  });

  // Giphy search
  gifBtn.addEventListener('click', async () => {
    const q = prompt('Search GIFs:');
    if (!q) return;
    try {
      const res = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${cfg.giphyKey}&q=${encodeURIComponent(q)}&limit=1&rating=g`);
      const json = await res.json();
      const gif = json?.data?.[0]?.images?.downsized_medium?.url;
      if (gif) {
        await sendMessage({ gifUrl: gif });
      } else {
        alert('No GIF found.');
      }
    } catch (e) {
      alert('Giphy error: ' + e.message);
    }
  });

  // Helpers
  const userAvatar = (u) => {
    const base = u.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(u.uid)}`;
    return `<img src="${base}" alt="" class="avatar"/>`;
  };

  const ts = () => firebase.database.ServerValue.TIMESTAMP;

  function ensureDefaultRoom() {
    const ref = db.ref('rooms/general');
    ref.get().then(snap => {
      if (!snap.exists()) {
        ref.set({ name: 'general', createdAt: ts() });
      }
    });
  }

  function joinRoom(roomId, name = roomId) {
    if (msgsListener && msgsRef) msgsRef.off('child_added', msgsListener);
    currentRoomId = roomId;
    roomNameEl.textContent = `#${name}`;
    messages.innerHTML = '';
    msgsRef = db.ref(`messages/${roomId}`);
    msgsListener = msgsRef.limitToLast(100).on('child_added', (snap) => {
      renderMessage(snap.key, snap.val());
    });
    // Stats: simple count
    db.ref(`messages/${roomId}`).limitToLast(1).get().then(s => {
      roomStatsEl.textContent = 'Welcome!';
    });
    // Save last room for user
    const u = auth.currentUser;
    if (u) db.ref(`users/${u.uid}/lastRoom`).set(roomId);
  }

  function renderMessage(id, msg) {
    const wrap = document.createElement('div');
    wrap.className = 'msg';
    const av = document.createElement('div');
    av.className = 'avatar';
    av.innerHTML = `<img src="${msg.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(msg.uid||'guest')}`}" alt="" style="width:100%;height:100%;">`;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = msg.displayName || 'Guest';
    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    meta.textContent = `${name} • ${time}`;
    bubble.appendChild(meta);
    if (msg.text) {
      const p = document.createElement('div');
      p.textContent = msg.text;
      bubble.appendChild(p);
    }
    if (msg.gifUrl) {
      const img = document.createElement('img');
      img.src = msg.gifUrl;
      img.className = 'gif';
      img.loading = 'lazy';
      bubble.appendChild(img);
    }
    wrap.appendChild(av);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage({ text=null, gifUrl=null }) {
    const u = auth.currentUser;
    if (!u || !currentRoomId) return;
    if (!text && !gifUrl) return;
    const payload = {
      uid: u.uid,
      displayName: u.displayName || 'Guest',
      photoURL: u.photoURL || null,
      text: text,
      gifUrl: gifUrl,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    await db.ref(`messages/${currentRoomId}`).push(payload);
  }

  sendBtn.addEventListener('click', async () => {
    const t = messageInput.value.trim();
    if (!t) return;
    await sendMessage({ text: t });
    messageInput.value = '';
  });
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // Rooms
  function renderRoomItem(id, data) {
    const el = document.createElement('div');
    el.className = 'item';
    el.textContent = data.name || id;
    if (id === currentRoomId) el.classList.add('active');
    el.addEventListener('click', () => joinRoom(id, data.name));
    roomsList.appendChild(el);
  }

  function subscribeRooms() {
    roomsList.innerHTML = '';
    const ref = db.ref('rooms');
    ref.on('child_added', s => renderRoomItem(s.key, s.val()));
    ref.on('child_changed', () => refreshRooms());
  }
  function refreshRooms() {
    db.ref('rooms').get().then(s => {
      roomsList.innerHTML = '';
      s.forEach(c => renderRoomItem(c.key, c.val()));
    });
  }

  newRoomBtn.addEventListener('click', async () => {
    const name = prompt('Room name:');
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    await db.ref(`rooms/${id}`).set({ name, createdAt: ts() });
    joinRoom(id, name);
  });

  // Presence / Users
  function subscribePresence() {
    const ref = db.ref('presence');
    ref.on('value', snap => {
      usersList.innerHTML = '';
      const val = snap.val() || {};
      Object.entries(val).forEach(([uid, u]) => {
        const div = document.createElement('div');
        div.className = 'user item ' + (u.online ? 'online' : '');
        div.innerHTML = `
          <img class="avatar" src="${u.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(uid)}`}" alt="">
          <div>
            <div class="name">${u.displayName || 'Guest'}</div>
            <div class="role">${u.role === 'admin' ? '<span class="badge-admin">🛡️ ADMIN</span>' : (u.online ? 'online' : 'offline')}</div>
          </div>
        `;
        usersList.appendChild(div);
      });
    });
  }

  function setupUserPresence(u) {
    // Basic profile for convenience
    db.ref(`users/${u.uid}`).update({
      displayName: u.displayName || 'Guest',
      photoURL: u.photoURL || null,
      email: u.email || null,
      updatedAt: ts()
    });
    presenceRef = db.ref(`presence/${u.uid}`);
    presenceRef.onDisconnect().update({ online:false, lastActive: firebase.database.ServerValue.TIMESTAMP });
    presenceRef.update({
      uid: u.uid,
      displayName: u.displayName || 'Guest',
      photoURL: u.photoURL || null,
      online: true,
      lastActive: ts(),
      // Simple admin flag: if email matches a specific address, treat as admin (you can change this)
      role: (u.email && u.email.toLowerCase() === 'mysteryman@example.com') ? 'admin' : 'user'
    });
  }

  // Auth state
  auth.onAuthStateChanged(async (u) => {
    if (u) {
      authScreen.classList.add('hidden');
      app.classList.remove('hidden');
      ensureDefaultRoom();
      subscribeRooms();
      subscribePresence();
      setupUserPresence(u);
      // join last room or general
      const last = (await db.ref(`users/${u.uid}/lastRoom`).get()).val();
      joinRoom(last || 'general', last || 'general');
    } else {
      if (presenceRef) presenceRef.update({ online:false, lastActive: ts() });
      app.classList.add('hidden');
      authScreen.classList.remove('hidden');
    }
  });

  // Expose for debugging
  window._parea = { db, auth };
})();
