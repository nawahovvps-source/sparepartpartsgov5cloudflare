module.exports = (handler) => async (req, res) => {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  return handler(req, res);
};
