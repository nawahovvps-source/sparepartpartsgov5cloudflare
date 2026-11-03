require('./_env');
const crypto = require('crypto');

const base64UrlEncode = (input) => {
  const buff = Buffer.from(input);
  return buff.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const base64UrlDecode = (input) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = pad ? normalized + '='.repeat(4 - pad) : normalized;
  return Buffer.from(padded, 'base64').toString('utf8');
};

const getSessionToken = (req) => {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = req.headers['cookie'] || '';
  const match = cookie.match(/(?:^|;\\s*)session=([^;]+)/);
  return match ? match[1] : '';
};

const signSession = (payload, secret) => {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  return `${body}.${signature}`;
};

const verifySession = (token, secret) => {
  if (!token || !secret) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  const payload = JSON.parse(base64UrlDecode(body));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
};

const setSessionCookie = (res, token, maxAgeSeconds, isSecure) => {
  const parts = [
    `session=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const clearSessionCookie = (res, isSecure) => {
  const parts = [
    'session=',
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    'Max-Age=0'
  ];
  if (isSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const requireAuth = (req, res) => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Missing env var: SESSION_SECRET' });
    return false;
  }
  const token = getSessionToken(req);
  const payload = verifySession(token, secret);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  req.user = payload;
  return true;
};

module.exports = {
  requireAuth,
  signSession,
  verifySession,
  setSessionCookie,
  clearSessionCookie
};
