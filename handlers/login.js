require('./_env');
const { buildOpenSheetUrl } = require('./_opensheet');
const { signSession, setSessionCookie } = require('./_auth');

const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      return {};
    }
  }
  return req.body;
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { username, password } = parseBody(req);
  if (!username || !password) {
    res.status(400).json({ error: 'Missing username or password' });
    return;
  }

  const sheetId = process.env.SHEET_ID_EMPLOYEE;
  const sheetName = process.env.SHEET_NAME_EMPLOYEE;
  if (!sheetId || !sheetName) {
    res.status(500).json({ error: 'Missing env vars: SHEET_ID_EMPLOYEE, SHEET_NAME_EMPLOYEE' });
    return;
  }

  const targetUrl = buildOpenSheetUrl(sheetId, sheetName);
  let upstream;
  try {
    upstream = await fetch(targetUrl, { headers: { 'Accept': 'application/json' } });
  } catch (err) {
    console.error('Upstream fetch error:', err);
    res.status(502).json({ error: 'Upstream connection failed: ' + err.message });
    return;
  }
  if (!upstream.ok) {
    console.error(`Upstream failed: ${upstream.status} for URL: ${targetUrl}`);
    res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    return;
  }

  const data = await upstream.json();
  const normalizedUsername = username.toString().trim();
  const expectedPassword = normalizedUsername.slice(-4);
  const employee = Array.isArray(data)
    ? data.find(item => (item.IDRec || '').toString().trim() === normalizedUsername)
    : null;

  if (!employee || expectedPassword !== password) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const ttlHours = Number(process.env.SESSION_TTL_HOURS || '24');
  const maxAgeSeconds = Math.max(1, Math.floor(ttlHours * 3600));
  const payload = {
    sub: normalizedUsername,
    name: employee.Name || '',
    auth: employee.Auth || 'None',
    team: employee.หน่วยงาน || '',
    plant: employee.Plant || '',
    exp: Date.now() + maxAgeSeconds * 1000
  };

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Missing env var: SESSION_SECRET' });
    return;
  }

  const token = signSession(payload, secret);
  const isSecure = (req.headers['x-forwarded-proto'] || '').includes('https');
  setSessionCookie(res, token, maxAgeSeconds, isSecure);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    status: 'success',
    user: {
      id: normalizedUsername,
      name: payload.name,
      auth: payload.auth,
      team: payload.team,
      plant: payload.plant
    },
    expiresAt: payload.exp
  });
};
