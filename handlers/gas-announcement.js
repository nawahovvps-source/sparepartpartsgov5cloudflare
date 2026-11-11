require('./_env');
const { requireAuth } = require('./_auth');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  const params = typeof req.body === 'string'
    ? new URLSearchParams(req.body)
    : new URLSearchParams(req.body || {});
  const action = params.get('action') || req.query?.action || 'getAnnouncements';
  if (action === 'createAnnouncement' && req.user.auth !== 'Admin') {
    res.status(403).json({ error: 'Admin permission required' });
    return;
  }

  const gasUrl = process.env.GAS_ANNOUNCEMENT_URL;
  if (!gasUrl) {
    res.status(500).json({ error: 'Missing env var: GAS_ANNOUNCEMENT_URL' });
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
  targetUrl.searchParams.set('employeeCode', String(req.user.sub || ''));
  targetUrl.searchParams.set('plant', String(req.user.plant || ''));

  const headers = {};
  const contentType = req.headers['content-type'] || '';
  if (contentType) headers['Content-Type'] = contentType;

  let body;
  if (req.method !== 'GET') {
    params.set('employeeCode', String(req.user.sub || ''));
    params.set('plant', String(req.user.plant || ''));
    params.set('createdBy', String(req.user.name || req.user.sub || ''));
    body = params.toString();
  }

  const upstream = await fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body
  });

  const text = await upstream.text();
  res.setHeader('Cache-Control', 'no-store');
  res.status(upstream.status).send(text);
};
