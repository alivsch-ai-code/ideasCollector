const LOCAL_KEY = 'ideasCollector.posts.v1';
const LIKED_KEY = 'ideasCollector.liked.v1';

const hasFirebase = () => !!(window.firebaseConfig && window.firebase);

let db = null;
if (hasFirebase()) {
  const appInstance = firebase.initializeApp(window.firebaseConfig);
  db = appInstance.firestore();
}

function getLikedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'));
  } catch (e) {
    return new Set();
  }
}

function saveLikedSet(set) {
  localStorage.setItem(LIKED_KEY, JSON.stringify([...set]));
}

function getLocalPosts() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveLocalPosts(posts) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(posts));
}

function addLocalPost(text) {
  const posts = getLocalPosts();
  const id = posts.length ? Math.max(...posts.map(p => p.id)) + 1 : 0;
  posts.push({ id, text, likes: 0 });
  saveLocalPosts(posts);
  return id;
}

function likeLocalPost(id) {
  const posts = getLocalPosts();
  const post = posts.find(p => p.id === id);
  if (post) post.likes += 1;
  saveLocalPosts(posts);
}

async function fetchPosts() {
  if (hasFirebase()) {
    try {
      const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').get();
      return snapshot.docs.map(doc => ({ id: doc.id, text: doc.data().text, likes: doc.data().likes || 0 }));
    } catch (e) {
      console.error('Firestore-Fehler beim Laden:', e);
      showStatus('Fehler beim Laden aus Firestore: ' + (e && e.message ? e.message : e), 'error');
      return getLocalPosts();
    }
  }
  try {
    const res = await fetch('/api/posts');
    if (!res.ok) throw new Error('api unavailable');
    return await res.json();
  } catch (e) {
    return getLocalPosts();
  }
}

async function submitPost(text) {
  if (hasFirebase()) {
    await db.collection('posts').add({
      text,
      likes: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }
  try {
    const res = await fetch('/api/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error('api unavailable');
  } catch (e) {
    addLocalPost(text);
  }
}

async function likePost(id) {
  if (hasFirebase()) {
    await db.collection('posts').doc(id).update({
      likes: firebase.firestore.FieldValue.increment(1),
    });
    return;
  }
  try {
    const res = await fetch('/api/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('api unavailable');
  } catch (e) {
    likeLocalPost(id);
  }
}

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function makeIdeaCard(post) {
  const card = document.createElement('article');
  card.className = 'idea-card';

  const text = document.createElement('div');
  text.className = 'idea-text';
  text.textContent = post.text;

  const meta = document.createElement('div');
  meta.className = 'idea-meta';

  const likedSet = getLikedSet();
  const likeBtn = document.createElement('button');
  likeBtn.className = 'like-btn' + (likedSet.has(String(post.id)) ? ' liked' : '');
  likeBtn.innerHTML = `<span>${likedSet.has(String(post.id)) ? '❤️' : '🤍'}</span><span>${post.likes}</span>`;
  likeBtn.addEventListener('click', async () => {
    likeBtn.disabled = true;
    const wasFirstLike = post.likes === 0;
    try {
      await likePost(post.id);
      const liked = getLikedSet();
      liked.add(String(post.id));
      saveLikedSet(liked);
      await refresh();
      playChime();
      if (wasFirstLike) triggerConfetti();
    } catch (e) {
      console.error('Fehler beim Liken:', e);
      showStatus('Like konnte nicht gespeichert werden.', 'error');
    } finally {
      likeBtn.disabled = false;
    }
  });

  meta.appendChild(likeBtn);
  card.appendChild(text);
  card.appendChild(meta);
  return card;
}

function makeTopItem(post, rank) {
  const el = document.createElement('div');
  el.className = 'top-item';

  const rankEl = document.createElement('div');
  rankEl.className = 'top-rank';
  rankEl.textContent = rank;

  const textEl = document.createElement('div');
  textEl.className = 'top-text';
  textEl.textContent = truncate(post.text, 48);
  textEl.title = post.text;

  const likesEl = document.createElement('div');
  likesEl.className = 'top-likes';
  likesEl.textContent = `❤ ${post.likes}`;

  el.appendChild(rankEl);
  el.appendChild(textEl);
  el.appendChild(likesEl);
  return el;
}

function setDbStatus() {
  const dot = document.getElementById('dbDot');
  const label = document.getElementById('dbLabel');
  if (!dot || !label) return;
  if (hasFirebase()) {
    dot.className = 'db-dot online';
    label.textContent = 'Verbunden mit Firestore-Datenbank';
  } else {
    dot.className = 'db-dot offline';
    label.textContent = 'Lokaler Speicher (Firebase nicht konfiguriert)';
  }
}

async function refresh() {
  const posts = await fetchPosts();

  const feed = document.getElementById('feed');
  const emptyState = document.getElementById('emptyState');
  feed.querySelectorAll('.idea-card').forEach(el => el.remove());

  const newestFirst = posts.slice().reverse();
  if (newestFirst.length === 0) {
    if (emptyState) emptyState.style.display = '';
  } else {
    if (emptyState) emptyState.style.display = 'none';
    newestFirst.forEach(p => feed.appendChild(makeIdeaCard(p)));
  }

  const postCount = document.getElementById('postCount');
  if (postCount) postCount.textContent = posts.length;

  const top = posts.slice().sort((a, b) => b.likes - a.likes).slice(0, 10);
  const topList = document.getElementById('topList');
  topList.innerHTML = '';
  if (top.length === 0 || top.every(p => p.likes === 0)) {
    const empty = document.createElement('p');
    empty.className = 'top-empty';
    empty.textContent = 'Noch keine Favoriten.';
    topList.appendChild(empty);
  } else {
    top.filter(p => p.likes > 0).forEach((p, i) => topList.appendChild(makeTopItem(p, i + 1)));
  }
}

function showStatus(message, type) {
  const el = document.getElementById('statusMsg');
  if (!el) return;
  el.textContent = message;
  el.className = 'status-msg' + (type ? ' ' + type : '');
  if (message) {
    setTimeout(() => {
      if (el.textContent === message) el.textContent = '';
      el.className = 'status-msg';
    }, 3000);
  }
}

const composerForm = document.getElementById('composerForm');
const postText = document.getElementById('postText');
const charCount = document.getElementById('charCount');
const submitBtn = document.getElementById('submitBtn');

if (postText && charCount) {
  postText.addEventListener('input', () => {
    charCount.textContent = `${postText.value.length} / 280`;
  });
}

if (composerForm) {
  composerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = postText.value.trim();
    if (!text) {
      showStatus('Bitte gib einen Text ein.', 'error');
      return;
    }
    submitBtn.disabled = true;
    try {
      await submitPost(text);
      postText.value = '';
      if (charCount) charCount.textContent = '0 / 280';
      showStatus('Danke! Deine Idee wurde gespeichert.', 'ok');
      await refresh();
      triggerConfetti();
      playChime();
    } catch (err) {
      showStatus('Etwas ist schiefgelaufen. Bitte versuche es erneut.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

const IDEA_PROMPTS = [
  'Eine Erinnerung an einen gemeinsamen Roadtrip mit Roman',
  'Romans peinlichster Moment, den alle kennen',
  'Ein Spitzname, den Roman mal hatte (oder haben sollte)',
  'Sein größter Sieg oder stolzester Moment',
  'Ein Insider-Witz, den nur ihr versteht',
  'Was Roman garantiert in jeder Situation sagt',
  'Seine Lieblingsausrede, wenn er zu spät kommt',
  'Ein Hobby von Roman, das alle überrascht hat',
  'Die verrückteste Nacht mit Roman',
  'Was Roman in 10 Jahren wohl macht',
  'Ein Satz, der Roman perfekt beschreibt',
  'Sein bestes (oder schlechtestes) Fashion-Statement',
];

const ideaSuggestBtn = document.getElementById('ideaSuggestBtn');
if (ideaSuggestBtn && postText) {
  ideaSuggestBtn.addEventListener('click', () => {
    const prompt = IDEA_PROMPTS[Math.floor(Math.random() * IDEA_PROMPTS.length)];
    postText.value = prompt;
    postText.focus();
    postText.dispatchEvent(new Event('input'));
  });
}

const fab = document.getElementById('fabSubmit');
if (fab) {
  fab.addEventListener('click', () => {
    postText?.focus();
    postText?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    fab.classList.add('active');
    setTimeout(() => fab.classList.remove('active'), 300);
  });
}

const PLAYLIST = [
  { title: 'Roman wird vierzig', src: 'Roman_wird_vierzig.mp3' },
  { title: 'Чёрный Бумер', src: 'chernyi-bumer.mp3' },
  { title: 'Чёрный Бумер (Флизинлегер-мэн)', src: 'chernyi-bumer-fliesenleger-man.mp3' },
  { title: 'Schwarzer Bimmer', src: 'schwarzer-bimmer.mp3' },
];

const bgMusic = document.getElementById('bgMusic');
const musicBar = document.getElementById('musicBar');
const musicToggle = document.getElementById('musicToggle');
const musicTitle = document.getElementById('musicTitle');
const musicPrev = document.getElementById('musicPrev');
const musicNext = document.getElementById('musicNext');

let currentTrack = 0;

function setMusicButton(state) {
  if (!musicBar || !musicToggle) return;
  const iconPlay = musicToggle.querySelector('.icon-play');
  const iconPause = musicToggle.querySelector('.icon-pause');
  musicBar.classList.remove('playing', 'blocked');
  if (state === 'playing') {
    musicBar.classList.add('playing');
    musicToggle.setAttribute('aria-pressed', 'true');
    musicToggle.setAttribute('aria-label', 'Musik pausieren');
    if (iconPlay) iconPlay.hidden = true;
    if (iconPause) iconPause.hidden = false;
  } else {
    if (state === 'blocked') musicBar.classList.add('blocked');
    musicToggle.setAttribute('aria-pressed', 'false');
    musicToggle.setAttribute('aria-label', 'Musik abspielen');
    if (iconPlay) iconPlay.hidden = false;
    if (iconPause) iconPause.hidden = true;
  }
}

function loadTrack(index, autoplay) {
  currentTrack = (index + PLAYLIST.length) % PLAYLIST.length;
  const track = PLAYLIST[currentTrack];
  if (musicTitle) musicTitle.textContent = track.title;
  bgMusic.src = track.src;
  if (autoplay) {
    bgMusic.play().then(() => setMusicButton('playing')).catch(() => setMusicButton('blocked'));
  }
}

if (bgMusic && musicToggle) {
  bgMusic.volume = 0.6;
  loadTrack(0, false);
  bgMusic.play().then(() => setMusicButton('playing')).catch(() => setMusicButton('blocked'));

  bgMusic.addEventListener('ended', () => loadTrack(currentTrack + 1, true));

  musicToggle.addEventListener('click', () => {
    if (bgMusic.paused) {
      bgMusic.play().then(() => setMusicButton('playing')).catch(() => setMusicButton('blocked'));
    } else {
      bgMusic.pause();
      setMusicButton('idle');
    }
  });

  musicPrev?.addEventListener('click', () => loadTrack(currentTrack - 1, true));
  musicNext?.addEventListener('click', () => loadTrack(currentTrack + 1, true));
}

// --- Konfetti ---
const confettiCanvas = document.getElementById('confettiCanvas');
const confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;

function resizeConfettiCanvas() {
  if (!confettiCanvas) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeConfettiCanvas);
resizeConfettiCanvas();

function triggerConfetti() {
  if (!confettiCtx) return;
  const colors = ['#7c5cff', '#22d3c5', '#ff7b9c', '#ffd36b', '#34d399'];
  const particles = Array.from({ length: 120 }, () => ({
    x: confettiCanvas.width / 2,
    y: confettiCanvas.height / 3,
    vx: (Math.random() - 0.5) * 14,
    vy: Math.random() * -14 - 4,
    size: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - 0.5) * 0.3,
  }));

  const gravity = 0.35;
  const duration = 2200;
  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    particles.forEach(p => {
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rotation);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      confettiCtx.restore();
    });
    if (elapsed < duration) {
      requestAnimationFrame(frame);
    } else {
      confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    }
  }
  requestAnimationFrame(frame);
}

// --- Sound-Chime ---
let audioCtx = null;
function playChime() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [0, 0.12].forEach((delay, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 0 ? 880 : 1174.66;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.15, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.3);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.35);
    });
  } catch (e) {
    // Sound ist ein Gimmick, kein Fehler wert
  }
}

// --- Live-Besucherzähler (Firestore presence) ---
const PRESENCE_TTL_MS = 45000;
const HEARTBEAT_INTERVAL_MS = 20000;

function getVisitorId() {
  let id = localStorage.getItem('ideasCollector.visitorId');
  if (!id) {
    id = 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('ideasCollector.visitorId', id);
  }
  return id;
}

async function heartbeatPresence() {
  if (!hasFirebase()) return;
  try {
    await db.collection('presence').doc(getVisitorId()).set({
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    // Presence ist ein Gimmick, kein Fehler wert
  }
}

async function updateLiveCount() {
  const livePanel = document.getElementById('livePanel');
  const liveCountEl = document.getElementById('liveCount');
  if (!hasFirebase() || !livePanel || !liveCountEl) return;
  try {
    const snapshot = await db.collection('presence').get();
    const now = Date.now();
    let count = 0;
    snapshot.forEach(doc => {
      const lastSeen = doc.data().lastSeen;
      if (lastSeen && lastSeen.toMillis && (now - lastSeen.toMillis()) < PRESENCE_TTL_MS) {
        count++;
      }
    });
    if (count > 0) {
      livePanel.hidden = false;
      liveCountEl.textContent = count === 1 ? '1 Person gerade hier' : `${count} Personen gerade hier`;
    } else {
      livePanel.hidden = true;
    }
  } catch (e) {
    livePanel.hidden = true;
  }
}

if (hasFirebase()) {
  heartbeatPresence();
  updateLiveCount();
  setInterval(heartbeatPresence, HEARTBEAT_INTERVAL_MS);
  setInterval(updateLiveCount, 15000);
}

// --- Easter Egg: 10x auf die Musiknote klicken ---
let easterEggClicks = 0;
let easterEggTimer = null;
const easterEggTrigger = document.getElementById('easterEggTrigger');

function triggerEmojiRain() {
  const emojis = ['🎉', '🥳', '🎂', '🎈', '🍾'];
  for (let i = 0; i < 40; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'emoji-rain-item';
      el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      el.style.left = (Math.random() * 90 + 2) + 'vw';
      el.style.animationDuration = (2 + Math.random() * 1.5) + 's';
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
    }, i * 40);
  }
}

if (easterEggTrigger) {
  easterEggTrigger.addEventListener('click', () => {
    easterEggClicks++;
    clearTimeout(easterEggTimer);
    easterEggTimer = setTimeout(() => { easterEggClicks = 0; }, 2000);
    if (easterEggClicks >= 10) {
      easterEggClicks = 0;
      triggerEmojiRain();
      triggerConfetti();
      showStatus('🎉 Alles Gute, Roman!', 'ok');
    }
  });
}

// --- Countdown bis zur Feier ---
const PARTY_DATE = new Date('2026-09-11T00:00:00');

function updateCountdown() {
  const banner = document.getElementById('countdownBanner');
  const text = document.getElementById('countdownText');
  if (!PARTY_DATE || !banner || !text) return;
  const diffMs = PARTY_DATE - new Date();
  if (diffMs <= 0) {
    banner.hidden = false;
    text.textContent = 'Die Feier läuft (oder ist schon vorbei)! 🎉';
    return;
  }
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  banner.hidden = false;
  text.textContent = `Noch ${days} Tag${days === 1 ? '' : 'e'} und ${hours} Std. bis Romans Feier!`;
}
updateCountdown();
setInterval(updateCountdown, 60000);

setDbStatus();
refresh();
setInterval(refresh, 10000);
