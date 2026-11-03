require('./_env');
const { requireAuth } = require('./_auth');
const { fetchOpenSheet, buildOpenSheetUrl } = require('./_opensheet');

const STOCK_SHEETS = {
  '0326': ['SHEET_ID_0326_STOCK', 'SHEET_NAME_0326_STOCK', 'Material,Unrestricted,คงเหลือ,วิภาวดี,Storage Bin,Storage bin'],
  '0330': ['SHEET_ID_0330_STOCK', 'SHEET_NAME_0330_STOCK', 'Material,Unrestricted,คงเหลือ,วิภาวดี,Storage Bin,Storage bin'],
  '0304': ['SHEET_ID_0304_STOCK', 'SHEET_NAME_0304_STOCK', 'Material,Unrestricted,คงเหลือ,วิภาวดี,Storage Bin,Storage bin'],
  nawanakorn: ['SHEET_ID_NAWANAKORN_STOCK', 'SHEET_NAME_NAWANAKORN_STOCK', 'Material,Unrestricted']
};

const normalizePlant = value => {
  const plant = String(value || '').trim().replace(/\.0$/, '');
  return /^\d+$/.test(plant) ? plant.padStart(4, '0') : plant;
};

const getUserPlant = async req => {
  const url = buildOpenSheetUrl(
    process.env.SHEET_ID_EMPLOYEE,
    process.env.SHEET_NAME_EMPLOYEE
  );
  const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!upstream.ok) {
    throw new Error(`Employee lookup failed: upstream ${upstream.status}`);
  }

  const employees = await upstream.json();
  const employee = Array.isArray(employees)
    ? employees.find(item => String(item.IDRec || '').trim() === String(req.user.sub || '').trim())
    : null;
  if (!employee) {
    throw new Error('Could not determine authenticated user Plant');
  }
  return normalizePlant(employee.Plant);
};

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) {
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let location = req.query.location;
  if (location === 'vibhavadi') {
    try {
      const plant = await getUserPlant(req);
      location = ['0304', '0326', '0330'].includes(plant) ? plant : '0326';
    } catch (error) {
      console.error('Failed to determine stock sheet for user:', error);
      res.status(502).json({ error: 'Could not determine stock sheet for user' });
      return;
    }
  }

  const sheet = STOCK_SHEETS[location];
  if (!sheet) {
    res.status(400).json({ error: 'Invalid stock location' });
    return;
  }

  const [sheetIdEnv, sheetNameEnv, defaultColumns] = sheet;
  if (!req.query.cols) {
    req.query.cols = defaultColumns;
  }
  await fetchOpenSheet(sheetIdEnv, sheetNameEnv, req, res);
};
