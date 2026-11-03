require('./_env');
const { requireAuth } = require('./_auth');

const { fetchOpenSheet } = require('./_opensheet');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  await fetchOpenSheet('SHEET_ID_ANNOUNCEMENT', 'SHEET_NAME_ANNOUNCEMENT', req, res);
};
