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
  // Optimize payload: Only fetch columns used in the UI
  if (!req.query.cols) {
    req.query.cols = 'DateTime,Ticket Number,Team,Brand,TeamPlant,ค้างหน่วยงาน,Material,Description,Vipa,DayRepair';
  }
  await fetchOpenSheet('SHEET_ID_PENDING', 'SHEET_NAME_PENDING', req, res);
};
