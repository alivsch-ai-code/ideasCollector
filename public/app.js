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
    const snapshot = await db.collection('posts').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, text: doc.data().text, likes: doc.data().likes || 0 }));
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
    try {
      await likePost(post.id);
      const liked = getLikedSet();
      liked.add(String(post.id));
      saveLikedSet(liked);
      await refresh();
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
    } catch (err) {
      showStatus('Etwas ist schiefgelaufen. Bitte versuche es erneut.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
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
  { title: 'Чёрный Бумер', src: 'chernyi-bumer.mp3' },
  { title: 'Roman wird vierzig', src: 'Roman_wird_vierzig.mp3' },
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

setDbStatus();
refresh();
setInterval(refresh, 10000);
