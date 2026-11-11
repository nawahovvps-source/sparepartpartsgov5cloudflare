const setDefault = (key, value) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
};

setDefault('OPEN_SHEET_BASE', 'https://opensheet.elk.sh');
setDefault('SHEET_ID_REQUEST', '1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE');
setDefault('SHEET_NAME_REQUEST', 'Request');
setDefault('SHEET_ID_MAIN_SAP', '1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw');
setDefault('SHEET_NAME_MAIN_SAP', 'MainSap');
setDefault('SHEET_ID_PENDING', '112KOJI227dvyHy4w_gD8wuANrVPmFK_ezzZyV_uWVrE');
setDefault('SHEET_NAME_PENDING', 'CallMaterial');
setDefault('SHEET_ID_CALL_MATERIAL', '112KOJI227dvyHy4w_gD8wuANrVPmFK_ezzZyV_uWVrE');
setDefault('SHEET_NAME_CALL_MATERIAL', 'CallMaterial');
setDefault('SHEET_ID_EMPLOYEE', '1eqVoLsZxGguEbRCC5rdI4iMVtQ7CK4T3uXRdx8zE3uw');
setDefault('SHEET_NAME_EMPLOYEE', 'Employee_Auth');
setDefault('SHEET_ID_IMAGE_DB', '1nbhLKxs7NldWo_y0s4qZ8rlpIfyyGkR_Dqq8INmhYlw');
setDefault('SHEET_NAME_IMAGE_DB', 'imageMIx');
setDefault('SHEET_ID_ANNOUNCEMENT', '1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o');
setDefault('SHEET_NAME_ANNOUNCEMENT', 'information');
setDefault('GAS_URL', 'https://script.google.com/macros/s/AKfycbzLmeaYxEBwZl7hiET1itYOgpmVSkxYoRvcMw3bmMp2csgJnAgwv-0vOGXP_hkevd-n1A/exec');
setDefault('GAS_ANNOUNCEMENT_URL', 'https://script.google.com/macros/s/AKfycbxQRLcQNNRkfbybnQ4hvTP9T1lOWZ7Fu6Jillt5ZmWRF-7BR-0fTTsiXGNBPtxgjmFP/exec');
setDefault('SHEET_ID_0326_STOCK', process.env.SHEET_ID_VIBHAVADI_STOCK || '1gtZLR5Tm574o5xRbdrRm9yFzRukGx_UAzUnoah36cxQ');
setDefault('SHEET_NAME_0326_STOCK', process.env.SHEET_NAME_VIBHAVADI_STOCK || 'Sheet1');
setDefault('SHEET_ID_0330_STOCK', '1WYOikuoWE30WXsWglTXfxoj1gmjxlFMJgpN3eXp43Bk');
setDefault('SHEET_NAME_0330_STOCK', 'Sheet1');
setDefault('SHEET_ID_0304_STOCK', '1miQgObvPdIocjf2Mwn-GZxRvDZy0R5gIl1zhxMWvM-E');
setDefault('SHEET_NAME_0304_STOCK', 'Sheet1');
setDefault('SHEET_ID_NAWANAKORN_STOCK', '1x-B1xekpMm4p7fkKucvLjaewtp66uGIp8ZIxJJZAxMk');
setDefault('SHEET_NAME_NAWANAKORN_STOCK', 'Sheet1');
setDefault('SHEET_ID_BORROW_STOCK', '1RMIu9yqJn8-IIMuYXVlkKsxV1izwuoBGwb7PomxGfjI');
setDefault('SHEET_NAME_BORROW_STOCK', 'Sheet1');
setDefault('SHEET_ID_EMPLOYEE_PHONE', '1eqVoLsZxGguEbRCC5rdI4iMVtQ7CK4T3uXRdx8zE3uw');
setDefault('SHEET_NAME_EMPLOYEE_PHONE', 'TrueMove');
