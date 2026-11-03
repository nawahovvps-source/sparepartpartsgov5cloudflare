require('./_env');
const { clearSessionCookie } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const isSecure = (req.headers['x-forwarded-proto'] || '').includes('https');
  clearSessionCookie(res, isSecure);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ status: 'ok' });
};
