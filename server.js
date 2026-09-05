const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname);
const POSTS_FILE = path.join(DATA_DIR, 'posts.txt');
const LIKES_FILE = path.join(DATA_DIR, 'likes.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function ensureFiles() {
  try {
    await fs.access(POSTS_FILE);
  } catch (e) {
    await fs.writeFile(POSTS_FILE, '', 'utf8');
  }
  try {
    await fs.access(LIKES_FILE);
  } catch (e) {
    await fs.writeFile(LIKES_FILE, '{}', 'utf8');
  }
}

async function readPosts() {
  const data = await fs.readFile(POSTS_FILE, 'utf8');
  const lines = data.split(/\r?\n/).filter(l => l.trim().length > 0);
  return lines.map((text, idx) => ({ id: idx, text }));
}

async function readLikes() {
  try {
    const raw = await fs.readFile(LIKES_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

async function writeLikes(likes) {
  await fs.writeFile(LIKES_FILE, JSON.stringify(likes, null, 2), 'utf8');
}

app.get('/api/posts', async (req, res) => {
  await ensureFiles();
  const posts = await readPosts();
  const likes = await readLikes();
  const combined = posts.map(p => ({ ...p, likes: likes[p.id] || 0 }));
  res.json(combined);
});

app.post('/api/post', async (req, res) => {
  const { text } = req.body;
  if (!text || !text.toString().trim()) return res.status(400).json({ error: 'empty' });
  await ensureFiles();
  const posts = await readPosts();
  const id = posts.length;
  // append text as plain line
  await fs.appendFile(POSTS_FILE, text.toString().trim() + '\n', 'utf8');
  const likes = await readLikes();
  likes[id] = 0;
  await writeLikes(likes);
  res.json({ id });
});

app.post('/api/like', async (req, res) => {
  const { id } = req.body;
  if (typeof id !== 'number') return res.status(400).json({ error: 'invalid id' });
  await ensureFiles();
  const posts = await readPosts();
  if (id < 0 || id >= posts.length) return res.status(404).json({ error: 'not found' });
  const likes = await readLikes();
  likes[id] = (likes[id] || 0) + 1;
  await writeLikes(likes);
  res.json({ id, likes: likes[id] });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
