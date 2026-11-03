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

  const source = req.query.type;
  if (source === 'phones') {
    if (req.user.auth !== 'Admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    if (!req.query.cols) {
      req.query.cols = 'IDEmployee,Phone';
    }
    await fetchOpenSheet('SHEET_ID_EMPLOYEE_PHONE', 'SHEET_NAME_EMPLOYEE_PHONE', req, res);
    return;
  }

  if (source) {
    res.status(400).json({ error: 'Invalid borrow data type' });
    return;
  }

  if (!req.query.cols) req.query.cols = 'Material,Description,จำนวน,Employee ID,Plant,ชื่อ,หน่วยงาน';
  await fetchOpenSheet('SHEET_ID_BORROW_STOCK', 'SHEET_NAME_BORROW_STOCK', req, res);
};
