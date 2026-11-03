require('./_env');
const { requireAuth } = require('./_auth');
const { buildOpenSheetUrl } = require('./_opensheet');

const FALLBACK_SHEET_ID = '1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE';

// ใช้ชีทเดียวกับ GAS (Request) เสมอ เพื่อให้ load/save ตรงกัน
const sheetConfig = {
  pending: {
    sheetId: process.env.SHEET_ID_REQUEST || FALLBACK_SHEET_ID,
    sheetName: process.env.SHEET_NAME_REQUEST || 'Request'
  },
  all: {
    sheetId: process.env.SHEET_ID_REQUEST || FALLBACK_SHEET_ID,
    sheetName: process.env.SHEET_NAME_REQUEST || 'Request'
  }
};

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const type = ((req.query?.type || req.query?.variant || '') || 'pending').toLowerCase();
  const mode = type === 'all' ? 'all' : 'pending';
  const { sheetId, sheetName } = sheetConfig[mode];

  if (!sheetId || !sheetName) {
    res.status(500).json({ error: 'Missing sheet configuration' });
    return;
  }

  const targetUrl = buildOpenSheetUrl(sheetId, sheetName);
  const upstream = await fetch(targetUrl, { headers: { Accept: 'application/json' } });

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    return;
  }

  const data = await upstream.json();
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(data);
};
