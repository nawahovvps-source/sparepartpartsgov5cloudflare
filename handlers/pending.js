require('./_env');
const { requireAuth } = require('./_auth');

const { buildOpenSheetUrl } = require('./_opensheet');

const fetchSheetRows = async (sheetIdEnv, sheetNameEnv) => {
  const sheetId = process.env[sheetIdEnv];
  const sheetName = process.env[sheetNameEnv];
  if (!sheetId || !sheetName) {
    throw new Error(`Missing env vars: ${sheetIdEnv}, ${sheetNameEnv}`);
  }

  const upstream = await fetch(buildOpenSheetUrl(sheetId, sheetName), {
    headers: { Accept: 'application/json' }
  });
  if (!upstream.ok) {
    throw new Error(`Upstream request failed with status ${upstream.status}`);
  }

  const rows = await upstream.json();
  if (!Array.isArray(rows)) {
    throw new Error(`Unexpected sheet data format: ${sheetNameEnv}`);
  }
  return rows;
};

const normalizeMaterial = value => String(value || '').trim().replace(/\.0$/, '');
const parseQuantity = value => {
  const quantity = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(quantity) ? quantity : 0;
};

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const [calls, stock] = await Promise.all([
      fetchSheetRows('SHEET_ID_CALL_MATERIAL', 'SHEET_NAME_CALL_MATERIAL'),
      fetchSheetRows('SHEET_ID_0326_STOCK', 'SHEET_NAME_0326_STOCK')
    ]);

    const stockByMaterial = new Map();
    stock.forEach(row => {
      const material = normalizeMaterial(row.Material);
      if (material && !stockByMaterial.has(material)) {
        stockByMaterial.set(material, {
          description: row.Description || '',
          unrestricted: parseQuantity(row.Unrestricted)
        });
      }
    });

    const pendingCalls = calls.map(row => {
      const stockItem = stockByMaterial.get(normalizeMaterial(row.Material));
      return {
        'Create Date': row['Create Date'] || '',
        'Ticket Number': row['Ticket Number'] || '',
        Team: row.Team || '',
        'Store Name': row['Store Name'] || '',
        TeamPlant: row.TeamPlant || '',
        Plant: row.Plant || '',
        'ค้างหน่วยงาน': row['ค้างหน่วยงาน'] || '',
        Material: row.Material || '',
        Description: stockItem ? stockItem.description : '',
        Unrestricted: stockItem ? stockItem.unrestricted : ''
      };
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(pendingCalls);
  } catch (error) {
    console.error('Failed to load CallMaterial or 0326 stock data:', error);
    res.status(502).json({ error: 'Failed to load CallMaterial or stock data' });
  }
};
