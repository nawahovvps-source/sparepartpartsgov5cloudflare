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
  // Optimize payload: Only fetch columns used in the Parts tab
  if (!req.query.cols) {
    // Note: Included commonly used columns. If search needs more, we add them here.
    req.query.cols = 'ImageDb,Material,Description,Storage bin,Unrestricted,Rebuilt,หมายเหตุ,Product,OCRTAXT';
  }
  await fetchOpenSheet('SHEET_ID_MAIN_SAP', 'SHEET_NAME_MAIN_SAP', req, res);
};
