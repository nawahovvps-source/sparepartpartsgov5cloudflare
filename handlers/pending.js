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
const normalizePlant = value => {
  const plant = String(value || '').trim().replace(/\.0$/, '');
  return /^\d+$/.test(plant) ? plant.padStart(4, '0') : plant;
};
const parseQuantity = value => {
  const quantity = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(quantity) ? quantity : 0;
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  if (!requireAuth(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const userPlant = normalizePlant(req.user.plant);
    const stockSheet = {
      '0304': ['SHEET_ID_0304_STOCK', 'SHEET_NAME_0304_STOCK'],
      '0326': ['SHEET_ID_0326_STOCK', 'SHEET_NAME_0326_STOCK'],
      '0330': ['SHEET_ID_0330_STOCK', 'SHEET_NAME_0330_STOCK']
    }[userPlant] || ['SHEET_ID_NAWANAKORN_STOCK', 'SHEET_NAME_NAWANAKORN_STOCK'];

    const [calls, descriptionStock, remainingStock] = await Promise.all([
      fetchSheetRows('SHEET_ID_PENDING', 'SHEET_NAME_PENDING'),
      fetchSheetRows('SHEET_ID_NAWANAKORN_STOCK', 'SHEET_NAME_NAWANAKORN_STOCK'),
      fetchSheetRows(...stockSheet)
    ]);

    const descriptionByMaterial = new Map();
    descriptionStock.forEach(row => {
      const material = normalizeMaterial(row.Material);
      if (material && !descriptionByMaterial.has(material)) {
        descriptionByMaterial.set(material, row['Material description'] || row.Description || '');
      }
    });

    const remainingByMaterial = new Map();
    remainingStock.forEach(row => {
      const material = normalizeMaterial(row.Material);
      if (material && !remainingByMaterial.has(material)) {
        remainingByMaterial.set(material, parseQuantity(row.Unrestricted || row['คงเหลือ'] || row['วิภาวดี']));
      }
    });

    const pendingCalls = calls.map(row => {
      const material = normalizeMaterial(row.Material);
      return {
        'Create Date': row['Create Date'] || '',
        'Ticket Number': row['Ticket Number'] || '',
        Team: row.Team || '',
        'Store Name': row['Store Name'] || '',
        TeamPlant: row.TeamPlant || '',
        Plant: row.Plant || '',
        'ค้างหน่วยงาน': row['ค้างหน่วยงาน'] || '',
        Material: row.Material || '',
        Description: descriptionByMaterial.get(material) || '',
        Unrestricted: remainingByMaterial.get(material) ?? 0
      };
    });

    res.status(200).json(pendingCalls);
  } catch (error) {
    console.error('Failed to load CallMaterial or user stock data:', error);
    res.status(502).json({ error: 'Failed to load CallMaterial or user stock data' });
  }
};
