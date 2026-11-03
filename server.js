const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// The local development server needs a signing key for session cookies.
// Production deployments must provide SESSION_SECRET through their environment.
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
}

const app = express();
const root = __dirname;
const apiDirectory = path.join(root, 'handlers');

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '4mb' }));

app.use('/api', (req, res, next) => {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
});

for (const filename of fs.readdirSync(apiDirectory)) {
  if (!filename.endsWith('.js') || filename.startsWith('_')) {
    continue;
  }

  const handler = require(path.join(apiDirectory, filename));
  if (typeof handler !== 'function') {
    throw new TypeError(`API handler must export a function: ${filename}`);
  }

  app.all(`/api/${path.basename(filename, '.js')}`, (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  });
}

app.get('/', (req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(root, 'index.html')));

for (const filename of ['offline.html', 'style.css', 'manifest.json', 'sw.js']) {
  app.get(`/${filename}`, (req, res) => res.sendFile(path.join(root, filename)));
}

for (const size of [152, 180, 192, 512]) {
  const filename = `icon-${size}.png`;
  app.get(`/${filename}`, (req, res) => res.sendFile(path.join(root, filename)));
}

app.use('/js', express.static(path.join(root, 'js')));

app.use((error, req, res, next) => {
  console.error('Unhandled request error:', error);
  if (res.headersSent) {
    return next(error);
  }
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Development server listening on http://localhost:${port}`);
});
