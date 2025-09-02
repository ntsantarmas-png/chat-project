// =========================
// Firebase
// =========================
const firebaseConfig = {
  apiKey: "AIzaSyAh4JNLUQWibHFPv2RE3-mqQUG58670IAU",
  authDomain: "chat-project-365bc.firebaseapp.com",
  projectId: "chat-project-365bc",
  storageBucket: "chat-project-365bc.appspot.com",
  messagingSenderId: "193892858440",
  appId: "1:193892858440:web:f316ed8322950f7bbc767d",
  databaseURL: "https://chat-project-365bc-default-rtdb.europe-west1.firebasedatabase.app"
};
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

const GIPHY_KEY = "bCn5Jvx2ZOepneH6fMteNoX31hVfqX25";

// =========================
// Helpers
// =========================
const defaultAvatar = (uid) => `https://i.pravatar.cc/100?u=${encodeURIComponent(uid||'guest')}`;
const $=s=>document.querySelector(s);
const escapeHtml=s=>(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function getUserAvatar(uid){
  const u = usersCache[uid];
  return (u && u.avatar) ? u.avatar : avatarUrl(uid); // fallback: σταθερό από uid
}

const uid6=u=>(u||'').slice(0,6);
const formatTime=ts=>ts?new Date(ts).toLocaleString():'';
function atCaret(input,add){const[start,end]=[input.selectionStart,input.selectionEnd];const v=input.value;input.value=v.slice(0,start)+add+v.slice(end);const pos=start+add.length;input.setSelectionRange(pos,pos);input.focus()}
function showToast(msg,type='ok'){const w=document.getElementById('toastWrap')||(()=>{const d=document.createElement('div');d.id='toastWrap';d.style.position='fixed';d.style.left='50%';d.style.bottom='18px';d.style.transform='translateX(-50%)';d.style.display='flex';d.style.flexDirection='column';d.style.gap='8px';d.style.zIndex='4000';document.body.appendChild(d);return d;})(); const t=document.createElement('div'); t.style.background='#11192a'; t.style.border='1px solid #2b3350'; t.style.padding='10px 14px'; t.style.borderRadius='12px'; t.style.minWidth='260px'; t.style.textAlign='center'; t.style.color='#e7eaf1'; if(type==='err') t.style.borderColor='#7f2632'; w.appendChild(t); t.textContent=msg; setTimeout(()=>{t.style.opacity='0'; t.style.transform='translateY(6px)';},2400); setTimeout(()=>{t.remove();},3000);}

const norm = s => (s||'').toString().toLowerCase().replace(/\s+/g,'').trim();
const stripNewlines = s => (s||'').toString().replace(/\s+/g,' ').trim();

// ====== Avatar helpers (NEW) ======
function avatarUrl(seed, style = 'adventurer') {
  // μαλακό background για να φαίνεται ωραία
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=96&radius=50&backgroundType=solid,gradientLinear&backgroundColor=f5f5f5,fff9c4,e0f7fa,ffe0e0`;
}
function cryptoRandomSeed() {
  const a = new Uint32Array(4);
  (window.crypto || window.msCrypto).getRandomValues(a);
  return Array.from(a).map(x => x.toString(16)).join('');
}

// =========================
// State
// =========================
let me=null, adminsMap={}, isAdmin=false, currentRoomId=null, unsubMsgs=null, myBannedGlobal=false;
const usersCache = {};
let typingTimer=null; const TYPING_TIMEOUT=3000; let typingRef=null;
let typingMap = {};
const reactionListeners = {}; // msgId -> callback
let mentionIndex = {}; // normalizedName -> uid
let lastEnterTs = 0;
let blocksMap = {}; // uid -> true
let lastSeen = {}; // roomId -> timestamp
let lastSentTs = 0;

// reply state
let replyState = null; // {msgId, uid, name, text}
const replyPreview = $('#replyPreview'), replyLabel = $('#replyLabel'), replyClose = $('#replyClose');

const mentionRe = /(^|[\s.,:;!?])@([\p{L}\p{N}_]{2,24})/gu; // @Name (unicode)

db.ref(".info/connected").on("value",s=>{$('#diagConnected').textContent=s.val()?"online":"offline"});

// =========================
// AUTH
// =========================
$('#btnRegister').onclick=async()=>{
  const username=($('#regUsername')?.value||'').trim();
  const email=($('#regEmail')?.value||'').trim();
  const pass=($('#regPass')?.value||'').trim();
  const err=$('#regErr'); if(err) err.textContent='';
  if(!username||!email||!pass){ if(err) err.textContent='Συμπλήρωσε όλα τα πεδία.'; return; }
  const unameKey=username.toLowerCase();
  try{
    const cred=await auth.createUserWithEmailAndPassword(email,pass);
    await cred.user.updateProfile({displayName:username});
    const tx=await db.ref('usernames/'+unameKey).transaction(curr=>{if(curr===null)return cred.user.uid;});
    if(!tx.committed||tx.snapshot.val()!==cred.user.uid){
      await db.ref('users/'+cred.user.uid).remove().catch(()=>{});
      await cred.user.delete().catch(()=>{});
      if(err) err.textContent='Το username είναι ήδη πιασμένο.'; return;
    }
    await db.ref('users/'+cred.user.uid).update({uid:cred.user.uid, displayName:username, online:true, updatedAt:Date.now()});
  }catch(e){ if(err) err.textContent=e?.message||'Register error'; }
};
$('#btnLogin').onclick=async()=>{
  const e=$('#logEmail')?.value?.trim()||''; const p=$('#logPass')?.value?.trim()||'';
  const err=$('#logErr'); if(err) err.textContent='';
  try{ await auth.signInWithEmailAndPassword(e,p); }catch(er){ if(err){err.textContent=er?.message||'Login error';}}
};
$('#btnAnon').onclick=()=>auth.signInAnonymously().catch(er=>{const e=$('#logErr'); if(e) e.textContent=er?.message||'Anon error';});
$('#btnForgot').onclick=async()=>{
  const e=$('#logEmail')?.value?.trim(); const err=$('#logErr');
  if(!e){ if(err) err.textContent='Enter your email first.'; return;}
  try{ await auth.sendPasswordResetEmail(e); if(err){ err.style.color='#9f9'; err.textContent='✅ Reset link sent to '+e; } }
  catch(er){ if(err){ err.style.color='#ffb0b0'; err.textContent=er?.message||'Reset failed'; } }
};
$('#btnSignOut').onclick=()=>auth.signOut();

// Session
auth.onAuthStateChanged(async(user)=>{
  me=user; $('#diagUid').textContent=me?me.uid:'-';
  if(!me){$('#auth').style.display='grid'; $('#app').style.display='none'; return;}
  $('#auth').style.display='none'; $('#app').style.display='flex';

  await refreshAdmins(); renderRole();

  // Ensure displayName & users/<uid>
  const authName=(auth.currentUser?.displayName||'').trim();
  const fallback = `User-${uid6(me.uid)}`;
  let nameToUse = authName || fallback;

  try{
    const uSnap=await db.ref('users/'+me.uid).get();
    const dbName=uSnap.exists() && (uSnap.val().displayName||'').trim();
    if(dbName) nameToUse=dbName;
    if(!auth.currentUser.displayName || auth.currentUser.displayName!==nameToUse){
      try{ await auth.currentUser.updateProfile({displayName:nameToUse}); }catch{}
    }
    await db.ref('users/'+me.uid).update({uid:me.uid, displayName:nameToUse, online:true, updatedAt:Date.now()});
    db.ref('users/'+me.uid+'/online').onDisconnect().set(false);
  }catch{}

  db.ref('bans/global/'+me.uid).on('value', s=>{ const prev=myBannedGlobal; myBannedGlobal=!!s.val(); if(prev!==myBannedGlobal){ showToast(myBannedGlobal?'You are banned globally':'Global ban removed', myBannedGlobal?'err':'ok'); } updateComposerLock(); });

  // subscribe my blocks & lastSeen
  db.ref('blocks/'+me.uid).on('value', s=>{ blocksMap = s.val() || {}; rerenderMessagesOnce(); });
  db.ref('userState/'+me.uid+'/lastSeen').on('value', s=>{ lastSeen = s.val() || {}; renderRoomsOnce(); });

  await ensureMainRoom();
  const mainSnap=await db.ref('rooms/Main').get();
  await selectRoom('Main', mainSnap.val());
  updateComposerLock();

  subscribeRooms();
  subscribeUsers();

  db.ref('roles/admins').on('value', async s=>{
    adminsMap=s.exists()?s.val():{}; isAdmin=!!(me&&adminsMap[me.uid]===true);
    $('#diagAdmin').textContent=String(isAdmin); renderRole(); await rerenderMessagesOnce();
  });
});

async function refreshAdmins(){const s=await db.ref('roles/admins').get(); adminsMap=s.exists()?s.val():{}; isAdmin=!!(me&&adminsMap[me.uid]===true); $('#diagAdmin').textContent=String(isAdmin);}
function renderRole(){$('#roleBadge').textContent=isAdmin?'Admin':'User'; renderRoomActions();}
async function ensureMainRoom(){const s=await db.ref('rooms/Main').get(); if(!s.exists()) await db.ref('rooms/Main').set({name:'Main',createdBy:'system',createdAt:Date.now(),lastMsgAt:0});}

// =========================
// ROOMS
// =========================
function subscribeRooms(){
  db.ref('rooms').on('value',snap=>{
    const val=snap.val()||{};
    window._roomsCache = val; // keep for unread calc
    renderRoomsOnce();
  });
}
function renderRoomsOnce(){
  const val = window._roomsCache || {};
  const list=$('#roomsList'); if(!list) return; list.innerHTML='';
  const entries=Object.entries(val);
  if(entries.length===0){list.innerHTML='<div class="small" style="opacity:.7">No rooms yet.</div>';return;}
  for(const [roomId,room] of entries){
    const div=document.createElement('div');
    div.className='room'+(currentRoomId===roomId?' active':'');
    const nameHtml = `<div style="font-weight:700">${escapeHtml(room.name||roomId)}</div><div class="small">by ${(room.createdBy||'system').toString().slice(0,6)}</div>`;
    const last = (room && room.lastMsgAt) || 0;
    const seen = (lastSeen && lastSeen[roomId]) || 0;
    const unread = last > seen;
    div.innerHTML=`
      <div class="badge-dot">${nameHtml}</div>
      ${unread?'<span class="unread">• new</span>':''}
    `;
    div.onclick=()=>selectRoom(roomId,room);
    list.appendChild(div);
  }
}

// One-room membership
async function updateMembership(nextRoomId){
  if(!me) return;
  const uid=me.uid;
  const ops=[];
  if(currentRoomId){ ops.push(db.ref('roomMembers/'+currentRoomId+'/'+uid).remove().catch(()=>{})); }
  ops.push(db.ref('roomMembers/'+nextRoomId+'/'+uid).set(true).catch(()=>{}));
  ops.push(db.ref('userState/'+uid+'/roomId').set(nextRoomId).catch(()=>{}));
  try{
    await Promise.all(ops);
    db.ref('roomMembers/'+nextRoomId+'/'+uid).onDisconnect().remove().catch(()=>{});
  }catch(err){
    console.warn('membership change skipped:', err?.message||err);
  }
}

function detachReactionsListeners(){
  Object.entries(reactionListeners).forEach(([msgId,fn])=>{
    db.ref('reactions/'+currentRoomId+'/'+msgId).off('value',fn);
    delete reactionListeners[msgId];
  });
}

async function selectRoom(roomId,room){
  if(!me) return;
  if(unsubMsgs){db.ref('messages/'+currentRoomId).off('value',unsubMsgs);unsubMsgs=null;}
  if(currentRoomId){
    db.ref('typing/'+currentRoomId).off();
    db.ref('typing/'+currentRoomId).off('child_added');
    db.ref('typing/'+currentRoomId).off('child_removed');
    db.ref('messages/'+currentRoomId).off('child_added');
    detachReactionsListeners();
  }
  currentRoomId=roomId; lastEnterTs=Date.now();
  $('#roomTitle').textContent=room?.name||roomId; $('#messages').innerHTML=''; renderRoomActions();

  await updateMembership(roomId);

  if(typingRef){ try{typingRef.remove();}catch{} }
  typingRef=db.ref('typing/'+currentRoomId+'/'+me.uid);
  typingRef.onDisconnect().remove().catch(()=>{});

  // Live typing
  typingMap = {};
  const tRoomRef=db.ref('typing/'+currentRoomId);
  tRoomRef.on('child_added', s=>{ if(s.key){ typingMap[s.key]=true; applyTypingFlags(); applyTypingBanner(); }});
  tRoomRef.on('child_removed', s=>{ if(s.key){ delete typingMap[s.key]; applyTypingFlags(); applyTypingBanner(); }});
  tRoomRef.on('value', s=>{ typingMap = s.val() || {}; applyTypingFlags(); applyTypingBanner(); });

  db.ref('bans/rooms/'+currentRoomId+'/'+me.uid).on('value',s=>{
    const b=!!s.val(); if(b){ showToast('You were kicked/banned from this room','err'); currentRoomId=null; $('#roomTitle').textContent='Select a room'; renderRoomActions(); }
    updateComposerLock();
  });

  // Full render with block-filter
  unsubMsgs=(snap)=>{
    const val=snap.val()||{};
    const entries=Object.entries(val).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
    const box=$('#messages'); box.innerHTML='';
    for(const [id,m] of entries){
      if(isMsgBlockedForMe(m)) continue;
      box.appendChild(renderMsg(id,m));
    }
    box.scrollTop=box.scrollHeight;
  };
  db.ref('messages/'+currentRoomId).on('value',unsubMsgs);

  // Mentions toast only for NEW messages after entering room
  db.ref('messages/'+currentRoomId).on('child_added', s=>{
    const m = s.val()||{}; if(!m || !m.text) return;
    if(m.uid===me.uid) return;
    if(m.createdAt && m.createdAt < lastEnterTs) return;
    if(hasMentionForUid(m.text, me?.uid)){ showToast('🔔 Αναφέρθηκες από '+nameFromUid(m.uid)); }
  });

  // mark lastSeen
  await db.ref('userState/'+me.uid+'/lastSeen/'+roomId).set(Date.now()).catch(()=>{});
  updateComposerLock();
}

$('#btnCreateRoom').onclick=async()=>{
  if(!me) return alert('Sign in first.');
  const name=($('#newRoomName').value||'').trim(); if(!name) return;
  const ref=db.ref('rooms').push(); await ref.set({name,createdBy:me.uid,createdAt:Date.now(),lastMsgAt:0});
  $('#newRoomName').value='';
};

function renderRoomActions(){const show=isAdmin&&currentRoomId&&currentRoomId!=='Main'; $('#roomActions').style.display=show?'flex':'none';}
async function clearRoomMessages(roomId){
  try{ await db.ref('messages/'+roomId).remove(); await db.ref('reactions/'+roomId).remove().catch(()=>{}); await db.ref('rooms/'+roomId+'/lastMsgAt').set(0).catch(()=>{}); }
  catch(err){ showToast(err?.message||'Clear failed','err'); }
}
$('#btnClearRoom').onclick=async()=>{
  if(!isAdmin||!currentRoomId) return;
  const ok=confirm('Clear ALL messages in this room?'); if(!ok) return;
  await clearRoomMessages(currentRoomId);
  showToast('Room cleared');
};
$('#btnDeleteRoom').onclick=async()=>{
  if(!isAdmin||!currentRoomId) return;
  if(currentRoomId==='Main'){ showToast('Cannot delete Main room','err'); return; }
  const ok=confirm('Delete this room, its messages and room-bans?'); if(!ok) return;
  try{
    await clearRoomMessages(currentRoomId);
    await db.ref('bans/rooms/'+currentRoomId).remove().catch(()=>{});
    await db.ref('rooms/'+currentRoomId).remove();
    showToast('Room deleted');
    currentRoomId=null; $('#roomTitle').textContent='Select a room'; renderRoomActions(); updateComposerLock();
  }catch(err){ showToast(err?.message||'Delete failed','err'); }
};

// =========================
// USERS
// =========================
function subscribeUsers(){
  const ref = db.ref('users');
  ref.on('value', snap=>{
    try{
      const val=snap.val()||{};
      const list=$('#usersList'); list.innerHTML='';
      mentionIndex={};
      const entries=Object.entries(val);
      for(const [uid,u] of entries){
        usersCache[uid]=u;
        if(u?.displayName){ mentionIndex[norm(u.displayName)]=uid; }
      }
      if(entries.length===0){list.innerHTML='<div class="small" style="opacity:.8">No users yet.</div>';return;}
      for(const [uid,u] of entries){
        const row=document.createElement('div'); row.className='user'; row.dataset.uid=uid;
        const isAdm=adminsMap[uid]===true;
        const name=(u && u.displayName) ? u.displayName : `User-${uid6(uid)}`;
        const online = !!u?.online;
        row.innerHTML =
  `<img class="u-ava" src="${getUserAvatar(uid)}" alt="">
   <div class="u-meta">
     <div class="u-name">${escapeHtml(name)} ${isAdm?`<span class="admintag" style="font-size:10px;background:rgba(255,202,58,.14);border:1px solid rgba(255,202,58,.35);color:#ffd86b;border-radius:999px;padding:2px 6px;">ADMIN</span>`:''}</div>
     <div class="u-sub"><span class="status"><span class="dot ${online?'on':''}"></span><span>${online?'online':'offline'}</span></span><span class="typing-flag" data-uid="${uid}"></span></div>
   </div>
   <button class="kebab" type="button" data-open="1">⋮</button>`;

        list.appendChild(row);
      }
      applyTypingFlags();
      applyTypingBanner();
    }catch(e){
      const list=$('#usersList'); list.innerHTML='<div class="small" style="opacity:.8">Failed to load users.</div>';
      console.error('users load error', e);
    }
  }, err=>{
    const list=$('#usersList'); list.innerHTML='<div class="small" style="opacity:.8">Cannot read users (rules?).</div>';
  });
}

// Typing helpers
function applyTypingFlags(){
  document.querySelectorAll('.typing-flag').forEach(el=>{
    const uid=el.dataset.uid;
    el.textContent = (typingMap && typingMap[uid]) ? ' · … typing' : '';
  });
}
function applyTypingBanner(){
  const b = document.getElementById('typingBanner');
  if(!currentRoomId){ b.style.display='none'; return; }
  const others = Object.keys(typingMap||{}).filter(uid => typingMap[uid] && uid !== (me&&me.uid));
  if(others.length===0){ b.style.display='none'; b.textContent=''; return; }
  const names = others.map(uid => (usersCache[uid]?.displayName) || `User-${uid6(uid)}`).filter(Boolean);
  const MAX=3;
  const label = names.length<=MAX ? names.join(', ') : names.slice(0,MAX).join(', ') + ` και ${names.length-MAX} ακόμη`;
  b.textContent = `Γράφουν: ${label} …`;
  b.style.display='block';
}

// Emoji master set
const emojiSet="😀 😃 😄 😁 😆 😂 🤣 😊 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥳 😏 😒 🙄 😬 🤥 😴 🤤 😪 😮 😯 😲 😳 🫣 😱 😨 😰 😥 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😶‍🌫️ 😶 😐 😑 😒 😕 🙁 ☹️ 😔 😟 😤 🤗 🤔 🤭 🤫 🤤 🤝 👍 👎 👊 ✊ 🤛 🤜 👏 🙌 👐 🤲 🙏 💪 🫶 ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 💟 🔥 ✨ 💫 🌟 ⭐ 🎉 🎊 🥂 🍻 🍺 🍕 🍔 🍟 🌭 🍗 🍖 🍣 🍤 🍱 🍜 🍝 🍲 🍛 🍰 🍫 🍩 🍪 ☕ 🍵 🧋 🫖 🎧 🎵 🎶 🎤 🎸 🎹 🥁 🎮 🕹️ 🏆 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🏓 🏸 🥅 🚗 ✈️ 🚀 🛰️ 🛸 ⏰ ⏳ 📷 📸 📱 💻 🖥️".split(/\s+/);
function initEmoji(){const grid=$('#emojiGrid'); if(!grid) return; grid.innerHTML=''; emojiSet.forEach(e=>{const b=document.createElement('div'); b.className='emoji'; b.textContent=e; b.title=e; b.onclick=()=>{atCaret($('#msgInput'),e)}; grid.appendChild(b);});}
initEmoji();

// Reactions picker grid
function initReactGrid(){const grid=$('#reactGrid'); if(!grid) return; grid.innerHTML=''; emojiSet.forEach(e=>{const b=document.createElement('div'); b.className='emoji'; b.textContent=e; b.title=e; b.onclick=()=>{ if(currentReactMsgId) toggleReaction(currentReactMsgId,e); closePopover($('#reactPop')); }; grid.appendChild(b);});}
initReactGrid();

// Popovers & GIF
function openPopover(menu, anchor){
  // toggle
  if(menu.style.display==='block'){ menu.style.display='none'; return; }
  menu.style.display='block'; menu.style.visibility='hidden';

  const ar = anchor.getBoundingClientRect();
  const pad = 8;
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Προσπάθησε ΠΑΝΩ από το κουμπί, αλλιώς ΚΑΤΩ
  let top = ar.top - mh - pad;
  if(top < 8) top = Math.min(ar.bottom + pad, vh - mh - 8);

  // Ασφαλής οριζόντια τοποθέτηση
  let left = ar.left;
  if(left + mw > vw - 8) left = Math.max(8, ar.right - mw);
  left = Math.min(Math.max(left, 8), vw - mw - 8);

  menu.style.left = left+'px';
  menu.style.top = top+'px';
  menu.style.visibility='visible';
}
function closePopover(menu){ menu.style.display='none'; }
const gifPop=$('#gifPop'), gifGrid=$('#gifGrid'), gifEmpty=$('#gifEmpty');
async function giphyFetch(url){ const res=await fetch(url); if(!res.ok) throw new Error('GIPHY error'); return await res.json(); }
async function loadTrending(){ try{ gifGrid.innerHTML=''; gifEmpty.style.display='none'; const data=await giphyFetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`); renderGifResults(data.data);}catch(e){ gifEmpty.style.display='block'; gifEmpty.textContent='Failed to load trending.'; } }
async function searchGifs(q){ try{ gifGrid.innerHTML=''; gifEmpty.style.display='none'; const url=`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=36&rating=pg-13&lang=en`; const data=await giphyFetch(url); renderGifResults(data.data);}catch(e){ gifEmpty.style.display='block'; gifEmpty.textContent='Search failed.'; } }
function renderGifResults(items){
  gifGrid.innerHTML='';
  if(!items || items.length===0){ gifEmpty.style.display='block'; gifEmpty.textContent='No results.'; return; }
  items.forEach(g=>{
    const still = g.images?.fixed_width_small_still?.url || g.images?.fixed_width_still?.url || g.images?.preview_gif?.url || g.images?.downsized_still?.url;
    const url = g.images?.original?.url || g.images?.downsized?.url || g.url;
    const div=document.createElement('div'); div.className='gif-item';
    const img=new Image(); img.src=still || url; img.alt='gif'; img.loading='lazy';
    div.appendChild(img);
    div.onclick=async()=>{ await sendMessageDirect(url); closePopover(gifPop); };
    gifGrid.appendChild(div);
  });
}
$('#btnGif').onclick=()=>{
  const pop = $('#gifPop');
  openPopover(pop, $('#btnGif'));
  // πάντα loadTrending στην πρώτη φορά
  loadTrending().then(()=>{
    // μόλις φορτωθούν τα GIFs, ξανατοποθέτηση
    if('ResizeObserver' in window){
      if(pop._ro){ try{ pop._ro.disconnect(); }catch{} }
      pop._ro = new ResizeObserver(()=> {
        // ξανατοποθέτηση με σωστό ύψος
        const ar = $('#btnGif').getBoundingClientRect();
        const pad = 8;
        const mw = pop.offsetWidth;
        const mh = pop.offsetHeight;
        let top = Math.max(8, ar.top - mh - pad);
        let left = Math.min(Math.max(ar.left, 8), window.innerWidth - mw - 8);
        pop.style.top = top+'px';
        pop.style.left = left+'px';
      });
      pop._ro.observe(pop);
    }
  });
};
$('#gifGo').onclick=()=>{ const q=$('#gifSearch').value.trim(); if(q) searchGifs(q); else loadTrending(); };
$('#gifSearch').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); $('#gifGo').click(); } });
$('#btnEmoji').onclick=()=>openPopover($('#emojiPop'), $('#btnEmoji'));
window.addEventListener('pointerdown',e=>{
  if(!e.target.closest('#emojiPop') && !e.target.closest('#btnEmoji')) closePopover($('#emojiPop'));
  if(!e.target.closest('#gifPop') && !e.target.closest('#btnGif')) closePopover($('#gifPop'));
  if(!e.target.closest('#reactPop')) closePopover($('#reactPop'));
  if(!e.target.closest('#ctxUser')) document.getElementById('ctxUser').style.display='none';
  if(!e.target.closest('#ctxMsg')) document.getElementById('ctxMsg').style.display='none';
});
// ESC to close popovers
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closePopover($('#emojiPop')); closePopover($('#gifPop')); closePopover($('#reactPop'));
    document.getElementById('ctxUser').style.display='none';
    document.getElementById('ctxMsg').style.display='none';
  }
});

// =========================
 // Messaging + typing + reply
// =========================
function updateComposerLock(){const locked=(!me||!currentRoomId||myBannedGlobal); $('#msgInput').disabled=locked; $('#btnSend').disabled=locked;}
$('#btnSend').onclick=sendMsg;
$('#msgInput').addEventListener('keydown',e=>{
  if(!me||!currentRoomId) return;
  setTyping(true);
  if(e.key==='Enter'){ e.preventDefault(); sendMsg(); }
});
$('#msgInput').addEventListener('input',()=>setTyping(true));
$('#msgInput').addEventListener('blur',()=>{ if(typingRef) typingRef.remove().catch(()=>{}); });

replyClose && (replyClose.onclick=()=>{ replyState=null; replyPreview.style.display='none'; });

function startReplyTo(msgId, m){
  const name = nameFromUid(m.uid);
  const snippet = stripNewlines(m.text||'').slice(0,120);
  replyState = {msgId, uid:m.uid, name, text: snippet};
  replyLabel.textContent = `Replying to ${name}: ${snippet}`;
  replyPreview.style.display='block';
  $('#msgInput').focus();
}

function setTyping(flag){
  if(!typingRef) return;
  if(flag){ typingRef.set(true).catch(()=>{}); }
  if(typingTimer) clearTimeout(typingTimer);
  typingTimer=setTimeout(()=>{ typingRef.remove().catch(()=>{}); }, TYPING_TIMEOUT);
}

async function sendMsg(){
  const textRaw=($('#msgInput').value||'').trim();
  if(!textRaw||!me||!currentRoomId||myBannedGlobal) return;
  const now = Date.now();
  if(now - lastSentTs < 500){ showToast('Slow down a bit 🙂'); return; }
  lastSentTs = now;
  await sendMessageDirect(textRaw, replyState);
  $('#msgInput').value='';
  replyState=null; replyPreview.style.display='none';
  if(typingRef) typingRef.remove().catch(()=>{});
}
async function sendMessageDirect(text, replyTo=null){
  if(!me||!currentRoomId||myBannedGlobal) return;
  const payload = {uid:me.uid,text,createdAt:Date.now()};
  if(replyTo && replyTo.msgId){ payload.replyTo = {msgId:replyTo.msgId, uid:replyTo.uid, name:replyTo.name, text:replyTo.text}; }
  const mref=db.ref('messages/'+currentRoomId).push();
  await mref.set(payload);
  await db.ref('rooms/'+currentRoomId+'/lastMsgAt').set(payload.createdAt).catch(()=>{});
}

// Mentions helpers
function findMentions(str){
  const hits=[];
  if(!str) return hits;
  for(const m of str.matchAll(mentionRe)){
    const raw = (m[2]||'').trim();
    const key = norm(raw);
    if(key) hits.push({raw, key});
  }
  return hits;
}
function hasMentionForUid(text, uid){
  const u = usersCache[uid]; if(!u?.displayName) return false;
  const key = norm(u.displayName);
  return findMentions(text).some(x=>x.key===key);
}
function renderTextWithMentions(text){
  const frag=document.createDocumentFragment();
  let idx=0; const str=text||'';
  for(const m of str.matchAll(mentionRe)){
    const fullStart = m.index + (m[1] ? m[1].length : 0);
    const atToken = '@'+m[2];
    const before = str.slice(idx, fullStart);
    if(before){ frag.appendChild(document.createTextNode(before)); }
    const span=document.createElement('span');
    span.className='mention';
    span.textContent=atToken;
    frag.appendChild(span);
    idx = fullStart + atToken.length;
  }
  const tail=str.slice(idx);
  if(tail){ frag.appendChild(document.createTextNode(tail)); }
  return frag;
}

// Embeds
function buildMessageContent(text){
  const frag=document.createDocumentFragment();
  const urlRe=/(https?:\/\/[^\s]+)/gi;
  let last=0, m;
  const appendText=(t)=>{const s=t; if(s===''||s==null) return; const div=document.createElement('div'); div.appendChild(renderTextWithMentions(s)); frag.appendChild(div);};
  while((m=urlRe.exec(text))){
    appendText(text.slice(last, m.index));
    const url=m[1];
    const node=renderUrlEmbed(url);
    if(node){ frag.appendChild(node); }
    else{
      const a=document.createElement('a'); a.href=url; a.textContent=url; a.target='_blank'; a.rel='noopener';
      const wrap=document.createElement('div'); wrap.appendChild(a); frag.appendChild(wrap);
    }
    last=urlRe.lastIndex;
  }
  appendText(text.slice(last));
  return frag;
}
function renderUrlEmbed(url){
  try{
    const u=new URL(url);
    const host=u.hostname.replace(/^www\./,'').toLowerCase();
    const path=u.pathname.toLowerCase();
    let ytId=null;
    if(host==='youtu.be'){ ytId = u.pathname.split('/')[1]||null; }
    else if(host==='youtube.com' || host==='m.youtube.com'){ ytId = u.searchParams.get('v'); }
    if(ytId && /^[a-zA-Z0-9_-]{11}$/.test(ytId)){
      const card=document.createElement('div'); card.className='yt-card';
      card.innerHTML=`<iframe src="https://www.youtube.com/embed/${ytId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      return card;
    }
    const looksGif = path.endsWith('.gif') || host.includes('giphy.com');
    if(looksGif){
      const g=document.createElement('div'); g.className='gif-card';
      const img=new Image(); img.src=url; img.alt='gif'; img.loading='lazy';
      g.appendChild(img); return g;
    }
  }catch(e){}
  return null;
}

// === Reactions ===
let currentReactMsgId=null;
function openReactPickerForMessage(msgId, anchorBtn){ currentReactMsgId = msgId; openPopover($('#reactPop'), anchorBtn); }
async function toggleReaction(msgId, emoji){
  if(!me || !currentRoomId) return;
  const base = db.ref(`reactions/${currentRoomId}/${msgId}/${emoji}/${me.uid}`);
  const snap = await base.get();
  if(snap.exists()){ await base.remove(); } else { await base.set(true); }
}
function attachReactionsListener(msgId){
  if(reactionListeners[msgId]) return;
  const ref = db.ref(`reactions/${currentRoomId}/${msgId}`);
  const cb = ref.on('value', snap=>{
    const cont = document.getElementById(`rx-${msgId}`);
    if(!cont) return;
    cont.innerHTML='';
    const val = snap.val() || {};
    const entries = Object.entries(val)
      .map(([emoji, by])=>({emoji, count: by ? Object.keys(by).length : 0, mine: !!by && !!by[me?.uid]}))
      .filter(x=>x.count>0)
      .sort((a,b)=>b.count-a.count);
    entries.forEach(({emoji,count,mine})=>{
      const chip = document.createElement('div');
      chip.className='rx-chip'+(mine?' mine':'');
      chip.title = mine ? 'Click to remove your reaction' : 'Click to react';
      chip.textContent = `${emoji} ${count}`;
      chip.onclick=()=>toggleReaction(msgId, emoji);
      cont.appendChild(chip);
    });
  });
  reactionListeners[msgId]=cb;
}

// Messages rendering + delete + reactions + mention + reply + edit + block filter
let ctxMsgId=null, ctxMsgUid=null;
function nameFromUid(uid){
  if(uid===me?.uid){
    const local = (auth.currentUser?.displayName||'').trim();
    if(local) return local;
  }
  const u = usersCache[uid];
  return (u && u.displayName) ? u.displayName : `User-${uid6(uid)}`;
}

function renderQuote(q){
  if(!q) return null;
  const div=document.createElement('div');
  div.className='quote';
  const a=document.createElement('div');
  a.className='q-author';
  a.innerHTML = `<span class="jump">Reply to ${escapeHtml(q.name||'user')}</span>`;
  const t=document.createElement('div'); t.className='q-text'; t.textContent=q.text||'';
  div.appendChild(a); div.appendChild(t);
  div.addEventListener('click',()=>{
    const el=document.getElementById('msg-'+q.msgId);
    if(el){ el.scrollIntoView({behavior:'smooth',block:'center'}); el.classList.add('flash'); setTimeout(()=>el.classList.remove('flash'),1400); }
  });
  return div;
}

function isMsgBlockedForMe(m){
  if(!m || !m.uid) return false;
  // αν ΕΓΩ έχω μπλοκάρει τον αποστολέα, κρύψε
  return !!blocksMap[m.uid];
}
// =====================
// Rendering messages
// =====================
function renderMsg(msgId, m){
  if(!m) return document.createComment('empty');

  // κρύψε μήνυμα αν το έχω μπλοκάρει
  if(isMsgBlockedForMe(m)) return document.createComment('blocked');

  const mine = me && m.uid === me.uid;
  const adm  = adminsMap[m.uid] === true;

  // ---- ΕΞΩΤΕΡΙΚΗ ΣΕΙΡΑ: (avatar + κάρτα)
  const row = document.createElement('div');
  row.className = 'msgRow' + (mine ? ' mine' : '');
  row.dataset.id  = msgId;
  row.dataset.uid = m.uid || '';

  // ---- ΚΑΡΤΑ ΜΗΝΥΜΑΤΟΣ
  const wrap = document.createElement('div');
  wrap.className = 'msg' + (mine ? ' mine' : '');
  wrap.id = 'msg-' + msgId;

  // mention ping (highlight) αν με αναφέρει
  if(!mine && hasMentionForUid(m.text||'', me?.uid)) wrap.classList.add('ping');

  // ---- HEADER (avatar + sender + ώρα)
  const header = document.createElement('div');
  header.className = 'topline';

  const ava = document.createElement('img');
  ava.className = 'u-ava' + (adm ? ' admin' : '');
  ava.src = getUserAvatar(m.uid);
  ava.alt = '';
  header.appendChild(ava);

  const sender = document.createElement('span');
  sender.className = 'sender' + (adm ? ' admin' : '');
  sender.textContent = nameFromUid(m.uid);
  if(adm){
    const badge = document.createElement('span');
    badge.className = 'admintag';
    badge.textContent = 'ADMIN';
    sender.appendChild(document.createTextNode(' '));
    sender.appendChild(badge);
  }
  header.appendChild(sender);

  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = formatTime(m.createdAt) + (m.editedAt ? ' (edited)' : '');
  header.appendChild(time);

  wrap.appendChild(header);

  // ---- Reply quote (αν υπάρχει)
  if(m.replyTo){
    const qDiv = renderQuote(m.replyTo);
    if(qDiv) wrap.appendChild(qDiv);
  }

  // ---- ΚΥΡΙΟ ΚΕΙΜΕΝΟ / EMBEDS
  const textDiv = document.createElement('div');
  textDiv.className = 'text';
  textDiv.appendChild(buildMessageContent(m.text || ''));
  wrap.appendChild(textDiv);

  // ---- Reactions strip
  const rxBar=document.createElement('div'); rxBar.className='reactions'; rxBar.id=`rx-${msgId}`;
  const rxBtn=document.createElement('button'); rxBtn.className='rx-btn'; rxBtn.textContent='🙂';
  rxBtn.title='Add reaction';
  rxBtn.onclick=(e)=>{ e.stopPropagation(); openReactPickerForMessage(msgId, rxBtn); };
  wrap.appendChild(rxBar); wrap.appendChild(rxBtn);
  attachReactionsListener(msgId);

  // ---- Reply / Edit / Delete
  const reply=document.createElement('button'); reply.className='replyBtn'; reply.textContent='↩'; reply.title='Reply';
  reply.onclick=(ev)=>{ ev.stopPropagation(); startReplyTo(msgId, m); };
  wrap.appendChild(reply);

  const canEdit = (me && m.uid===me.uid && (!m.createdAt || (Date.now()-m.createdAt)<=5*60*1000));
  if(canEdit){
    const edit=document.createElement('button'); edit.className='editBtn'; edit.textContent='✎'; edit.title='Edit message (5 min)';
    edit.onclick=(ev)=>{ ev.stopPropagation(); editMessageInline(wrap, msgId, m); };
    wrap.appendChild(edit);
  }

  if(isAdmin){
    const del=document.createElement('button'); del.className='delBtn'; del.textContent='🗑'; del.title='Delete message';
    del.onclick=async(ev)=>{ ev.stopPropagation(); await deleteMessage(msgId); };
    wrap.appendChild(del);
  }

  // context menu (admin)
  row.addEventListener('contextmenu',(e)=>{if(!isAdmin)return; e.preventDefault(); ctxMsgId=msgId; ctxMsgUid=m.uid; document.getElementById('ctxMsgFrom').textContent=nameFromUid(m.uid); openCtx(document.getElementById('ctxMsg'),e.clientX,e.clientY);});

  // σύνδεση: row = avatar + κάρτα
  row.appendChild(wrap);
  return row;
}


async function editMessageInline(node, msgId, m){
  const textNode = node.querySelector('.text');
  if(!textNode) return;
  const old = m.text || '';
  const ta=document.createElement('textarea');
  ta.value = old;
  ta.style.width='100%'; ta.style.minHeight='60px'; ta.style.background='#0b101c'; ta.style.color='#e7eaf1';
  ta.style.border='1px solid #2b3350'; ta.style.borderRadius='8px'; ta.style.padding='8px'; ta.style.marginTop='6px';
  textNode.replaceWith(ta);
  ta.focus();
  const save=async()=>{
    const newText = (ta.value||'').trim();
    if(!newText){ showToast('Empty not allowed','err'); return; }
    try{
      await db.ref('messages/'+currentRoomId+'/'+msgId).update({text:newText, editedAt:Date.now()});
    }catch(err){ showToast(err?.message||'Edit failed','err'); }
  };
  ta.addEventListener('keydown',e=>{
    if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){ e.preventDefault(); save(); }
    if(e.key==='Escape'){ e.preventDefault(); rerenderMessagesOnce(); }
  });
  const handler=(e)=>{ if(!ta.contains(e.target)){ save(); window.removeEventListener('pointerdown',handler,true); } };
  window.addEventListener('pointerdown',handler,true);
}

async function deleteMessage(id){
  if(!isAdmin||!currentRoomId||!id) return;
  try{
    await db.ref('messages/'+currentRoomId+'/'+id).remove();
    await db.ref('reactions/'+currentRoomId+'/'+id).remove().catch(()=>{});
    showToast('Message deleted');
  }catch(err){ showToast(err?.message||'Delete failed','err'); }
}
async function rerenderMessagesOnce(){
  if(!currentRoomId) return;
  const snap=await db.ref('messages/'+currentRoomId).get();
  const val=snap.val()||{};
  const entries=Object.entries(val).sort((a,b)=>(a[1].createdAt||0)-(b[1].createdAt||0));
  const box=$('#messages'); box.innerHTML='';
  for(const [id,m] of entries){ if(isMsgBlockedForMe(m)) continue; box.appendChild(renderMsg(id,m)); }
}

// =========================
// Context menus (admin)
// =========================
const ctxUser=document.getElementById('ctxUser'), ctxMsg=document.getElementById('ctxMsg'); let ctxTargetUid=null;
function openCtx(menu,x,y){menu.style.display='block'; const pad=8,mw=menu.offsetWidth||240,mh=menu.offsetHeight||160; const nx=Math.min(x,window.innerWidth-mw-pad), ny=Math.min(y,window.innerHeight-mh-pad); menu.style.left=nx+'px'; menu.style.top=ny+'px';}
window.addEventListener('pointerdown',e=>{if(e.button!==0)return; if(!e.target.closest('#ctxUser')) ctxUser.style.display='none'; if(!e.target.closest('#ctxMsg')) ctxMsg.style.display='none';});

const usersList = document.getElementById('usersList');
usersList.addEventListener('click', (e)=>{
  const kebab = e.target.closest('button.kebab');
  const row = e.target.closest('.user'); if(!row) return;
  const uid = row.dataset.uid;
  const name = row.querySelector('.u-name')?.textContent?.trim() || nameFromUid(uid);
  ctxTargetUid = uid; document.getElementById('ctxUserName').textContent = name;
  const anchor = kebab || row; const r = anchor.getBoundingClientRect();
  openCtx(ctxUser, r.left + r.width - 8, r.top + r.height + 6);
});

ctxUser.addEventListener('click',async e=>{
  const item=e.target.closest('.item[data-action]'); if(!item) return;
  const act=item.dataset.action; if(!me||!ctxTargetUid) return;
  if(me.uid===ctxTargetUid&&(act==='kickRoom'||act==='banGlobal')){showToast('Cannot act on yourself','err');return;}
  try{
    if(act==='addFriend'){ await db.ref('friends/'+me.uid+'/'+ctxTargetUid).set(true); showToast('Friend added'); }
    else if(act==='removeFriend'){ await db.ref('friends/'+me.uid+'/'+ctxTargetUid).remove(); showToast('Friend removed'); }
    else if(act==='block'){ await db.ref('blocks/'+me.uid+'/'+ctxTargetUid).set(true); showToast('User blocked'); await rerenderMessagesOnce(); }
    else if(act==='unblock'){ await db.ref('blocks/'+me.uid+'/'+ctxTargetUid).remove(); showToast('User unblocked'); await rerenderMessagesOnce(); }
    else if(act==='kickRoom'){ if(!isAdmin||!currentRoomId) throw new Error('Not admin or no room'); await db.ref('bans/rooms/'+currentRoomId+'/'+ctxTargetUid).set(true); showToast('User kicked from room'); }
    else if(act==='banGlobal'){ if(!isAdmin) throw new Error('Not admin'); await db.ref('bans/global/'+ctxTargetUid).set(true); showToast('User globally banned'); }
    else if(act==='unbanAll'){ if(!isAdmin) throw new Error('Not admin'); await db.ref('bans/global/'+ctxTargetUid).remove(); if(currentRoomId) await db.ref('bans/rooms/'+currentRoomId+'/'+ctxTargetUid).remove(); showToast('User unbanned'); }
  }catch(err){ showToast(err?.message||'Action failed','err'); }
  ctxUser.style.display='none';
});

ctxMsg.addEventListener('click',async e=>{
  const item=e.target.closest('.item[data-action]'); if(!item) return;
  if(item.dataset.action==='delMsg' && isAdmin && currentRoomId && ctxMsgId){
    await deleteMessage(ctxMsgId);
    ctxMsg.style.display='none';
  }
});

// =========================
// Profile Modal + Avatar (NEW CLEAN BLOCK)
// =========================
window.addEventListener("DOMContentLoaded", () => {
  const profileModal = document.getElementById("profileModal");
  const btnProfile   = document.getElementById("btnProfile");
  const btnClose     = document.getElementById("btnCloseProfile");
  const btnSave      = document.getElementById("btnSaveProfile");
  const imgPreview   = document.getElementById("avatarPreview");
  const btnRandom    = document.getElementById("avatarRandomBtn");
  const inputName    = document.getElementById("profileName");
  const inputAvatar  = document.getElementById("profileAvatar");

  async function loadProfileForm(){
    const u = auth.currentUser;
    if(!u) return;

    // Φέρε ό,τι υπάρχει στη DB
    const snap = await db.ref("users/"+u.uid).get();
    const val = snap.val() || {};

    // Όνομα
    inputName && (inputName.value = (val.displayName || u.displayName || "").trim());

    // Avatar URL: DB -> input -> σταθερό από uid (DiceBear)
    const url = (val.avatar && val.avatar.trim())
      || (inputAvatar && inputAvatar.value && inputAvatar.value.trim())
      || avatarUrl(u.uid);

    if(inputAvatar) inputAvatar.value = url;
    if (imgPreview) imgPreview.src = url;
  }

  if(btnProfile){
    btnProfile.onclick = () => {
      profileModal.style.display = "flex";
      loadProfileForm();
    };
  }
  if(btnClose){
    btnClose.onclick = () => {
      profileModal.style.display = "none";
    };
  }
  if(btnRandom && imgPreview && inputAvatar){
    btnRandom.onclick = () => {
      const seed = cryptoRandomSeed();
      const url  = avatarUrl(seed);
      imgPreview.src   = url;     // δείξε preview
      inputAvatar.value = url;    // γράψ’ το για να σωθεί με Save
    };
  }
  if(btnSave){
    btnSave.onclick = async () => {
      const u = auth.currentUser; 
      if(!u) return;
      const name   = (inputName?.value||"").trim();
      const avatar = (inputAvatar?.value||"").trim();
      try {
        if(name){ await u.updateProfile({displayName:name}); }
        await db.ref("users/"+u.uid).update({
          displayName: name || u.displayName || ("User-"+uid6(u.uid)),
          avatar: avatar || null,
          updatedAt: Date.now()
        });
        showToast("✅ Profile updated!");
        profileModal.style.display = "none";
      } catch(e){
        showToast("❌ " + (e?.message||e), "err");
      }
    };
  }
});

// =========================
// Typing banner helpers (already referenced above)
// =========================
function applyTypingFlags(){
  document.querySelectorAll('.typing-flag').forEach(el=>{
    const uid=el.dataset.uid;
    el.textContent = (typingMap && typingMap[uid]) ? ' · … typing' : '';
  });
}

// PATCH: refresh messages after profile save (avatar/name)
window.addEventListener('DOMContentLoaded', () => {
  const btnSave = document.getElementById('btnSaveProfile');
  if (!btnSave) return;
  btnSave.addEventListener('click', async () => {
    try {
      await rerenderMessagesOnce();
    } catch (e) {
      console.warn('rerender failed', e);
    }
  });
});
// Enable avatar preview + randomizer in Profile modal
window.addEventListener('DOMContentLoaded', () => {
  const inputAvatar = document.getElementById('profileAvatar');
  const preview     = document.getElementById('avatarPreview');
  const btnRand     = document.getElementById('btnAvatarRandom');

  // helper που έχουμε ήδη (αν υπάρχει, χρησιμοποίησέ την ίδια)
  function avatarUrl(seed, style='adventurer'){
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}&size=96&radius=50&backgroundType=solid,gradientLinear&backgroundColor=f5f5f5`;
  }

  if (inputAvatar && preview) {
    // αρχικό preview
    preview.src = inputAvatar.value || avatarUrl(Date.now());
    // live preview όταν γράφεις URL
    inputAvatar.addEventListener('input', () => { preview.src = inputAvatar.value || ''; });
  }

  if (btnRand && inputAvatar && preview) {
    btnRand.addEventListener('click', () => {
      const seed = Math.random().toString(36).slice(2, 10);
      const url  = avatarUrl(seed);
      inputAvatar.value = url;
      preview.src = url;
    });
  }
});

// Ensure #auth / #app visibility always matches sign-in state
firebase.auth().onAuthStateChanged((user) => {
  const authBox = document.getElementById('auth');
  const appBox  = document.getElementById('app');

  if (user) {
    if (authBox) authBox.style.display = 'none';
    if (appBox)  appBox.style.display  = 'flex';
  } else {
    if (authBox) authBox.style.display = 'grid'; // ή 'block' ανάλογα με το layout σου
    if (appBox)  appBox.style.display  = 'none';
  }
});
