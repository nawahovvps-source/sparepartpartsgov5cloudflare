require('./_env');
const { requireAuth } = require('./_auth');

const buildBody = (req) => {
  if (typeof req.body === 'string') {
    return req.body;
  }
  if (req.body && typeof req.body === 'object') {
    return new URLSearchParams(req.body).toString();
  }
  return '';
};

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const gasUrl = process.env.GAS_URL;
  if (!gasUrl) {
    res.status(500).json({ error: 'Missing env var: GAS_URL' });
    return;
  }

  const targetUrl = new URL(gasUrl);
  if (req.query) {
    Object.entries(req.query).forEach(([key, value]) => {
      if (typeof value === 'undefined') return;
      if (Array.isArray(value)) {
        value.forEach(item => targetUrl.searchParams.append(key, item));
      } else {
        targetUrl.searchParams.set(key, value);
      }
    });
  }

  const headers = {};
  const contentType = req.headers['content-type'] || '';
  if (contentType) headers['Content-Type'] = contentType;

  const upstream = await fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body: req.method === 'GET' ? undefined : buildBody(req)
  });

  const text = await upstream.text();
  res.setHeader('Cache-Control', 'no-store');
  res.status(upstream.status).send(text);
};
