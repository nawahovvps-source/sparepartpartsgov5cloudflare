require('./_env');

const buildOpenSheetUrl = (sheetId, sheetName) => {
  const base = process.env.OPEN_SHEET_BASE || 'https://opensheet.elk.sh';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}${sheetId}/${encodeURIComponent(sheetName)}`;
};

const fetchOpenSheet = async (sheetIdEnv, sheetNameEnv, req, res) => {
  const sheetId = process.env[sheetIdEnv];
  const sheetName = process.env[sheetNameEnv];
  if (!sheetId || !sheetName) {
    res.status(500).json({
      error: `Missing env vars: ${sheetIdEnv}, ${sheetNameEnv}`
    });
    return;
  }

  const targetUrl = buildOpenSheetUrl(sheetId, sheetName);
  const upstream = await fetch(targetUrl, {
    headers: { 'Accept': 'application/json' }
  });

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    return;
  }

  const data = await upstream.json();

  // Optional: Column Filtering to reduce payload size
  if (req.query.cols) {
    const cols = req.query.cols.split(',');
    const filtered = data.map(row => {
      const newRow = {};
      cols.forEach(col => {
        if (row[col] !== undefined) newRow[col] = row[col];
      });
      return newRow;
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(filtered);
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(data);
};

module.exports = { fetchOpenSheet, buildOpenSheetUrl };
