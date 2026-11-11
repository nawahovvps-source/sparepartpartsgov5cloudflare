const ANNOUNCEMENT_SPREADSHEET_ID = '1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o';
const EMPLOYEE_SPREADSHEET_ID = '1eqVoLsZxGguEbRCC5rdI4iMVtQ7CK4T3uXRdx8zE3uw';
const EMPLOYEE_SHEET_NAME = 'Employee_Auth';
const ANNOUNCEMENTS_SHEET_NAME = 'Announcements';
const ANNOUNCEMENT_READS_SHEET_NAME = 'AnnouncementReads';

const ANNOUNCEMENTS_HEADERS = [
  'AnnouncementID', 'Title', 'Message', 'Type', 'StartAt',
  'EndAt', 'IsActive', 'TargetPlant', 'CreatedAt', 'CreatedBy', 'TargetTeam'
];
const ANNOUNCEMENT_READS_HEADERS = ['AnnouncementID', 'EmployeeCode', 'ReadAt'];
const PREVIOUS_ANNOUNCEMENTS_HEADERS = ANNOUNCEMENTS_HEADERS.slice(0, 10);

function doGet(e) {
  return handleAnnouncementRequest(e);
}

function doPost(e) {
  return handleAnnouncementRequest(e);
}

function handleAnnouncementRequest(e) {
  let response;
  try {
    const params = getAnnouncementParams(e);
    switch (params.action || 'getAnnouncements') {
      case 'getAnnouncements':
        response = getAnnouncements(params);
        break;
      case 'markAnnouncementRead':
        response = markAnnouncementRead(params);
        break;
      case 'createAnnouncement':
        response = createAnnouncement(params);
        break;
      default:
        response = { status: 'error', data: 'Unknown announcement action' };
    }
  } catch (error) {
    Logger.log(`Announcement API error: ${error}`);
    response = { status: 'error', data: error.message || String(error) };
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAnnouncementParams(e) {
  const params = Object.assign({}, (e && e.parameter) || {});
  const contents = e && e.postData && e.postData.contents;
  if (contents) {
    try {
      const body = JSON.parse(contents);
      Object.keys(body).forEach(key => {
        if (typeof params[key] === 'undefined') params[key] = body[key];
      });
    } catch (error) {
      // Form-encoded requests are already available through e.parameter.
    }
  }
  return params;
}

function setupAnnouncementSheets() {
  const spreadsheet = SpreadsheetApp.openById(ANNOUNCEMENT_SPREADSHEET_ID);
  ensureAnnouncementSheet(spreadsheet, ANNOUNCEMENTS_SHEET_NAME, ANNOUNCEMENTS_HEADERS, [150, 220, 420, 120, 160, 160, 100, 140, 160, 160, 220], [5, 6, 9]);
  ensureAnnouncementSheet(spreadsheet, ANNOUNCEMENT_READS_SHEET_NAME, ANNOUNCEMENT_READS_HEADERS, [180, 160, 180], [3]);
  Logger.log('Announcement sheets are ready.');
}

function ensureAnnouncementSheet(spreadsheet, sheetName, headers, widths, dateColumns) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existingColumnCount = sheet.getLastColumn();
    const actualHeaders = sheet.getRange(1, 1, 1, existingColumnCount)
      .getDisplayValues()[0]
      .map(value => value.trim());

    if (
      sheetName === ANNOUNCEMENTS_SHEET_NAME &&
      actualHeaders.length === PREVIOUS_ANNOUNCEMENTS_HEADERS.length &&
      PREVIOUS_ANNOUNCEMENTS_HEADERS.every((header, index) => actualHeaders[index] === header)
    ) {
      sheet.getRange(1, headers.length).setValue('TargetTeam');
    } else if (!headers.every((header, index) => actualHeaders[index] === header)) {
      throw new Error(`Sheet "${sheetName}" has unexpected headers; existing data was not changed.`);
    }
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1f4e78')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true);
  widths.forEach((width, index) => sheet.setColumnWidth(index + 1, width));
  dateColumns.forEach(column => {
    sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1)
      .setNumberFormat('dd/mm/yyyy hh:mm:ss');
  });
}

function getAnnouncements(params) {
  const user = getAnnouncementUser(params.employeeCode);
  const spreadsheet = SpreadsheetApp.openById(ANNOUNCEMENT_SPREADSHEET_ID);
  const announcementSheet = getRequiredAnnouncementSheet(spreadsheet, ANNOUNCEMENTS_SHEET_NAME);
  const readSheet = getRequiredAnnouncementSheet(spreadsheet, ANNOUNCEMENT_READS_SHEET_NAME);
  const rows = getSheetObjects(announcementSheet, ANNOUNCEMENTS_HEADERS);
  const now = new Date();
  const readIds = getReadAnnouncementIds(readSheet, user.employeeCode);

  const announcements = rows
    .filter(row =>
      isAnnouncementActive(row, now) &&
      isAnnouncementForPlant(row.TargetPlant, user.plant) &&
      isAnnouncementForTeam(row.TargetTeam, user.team)
    )
    .map(row => Object.assign({}, row, {
      IsRead: readIds.has(String(row.AnnouncementID))
    }));

  return { status: 'success', data: announcements };
}

function markAnnouncementRead(params) {
  const announcementId = String(params.announcementId || '').trim();
  const user = getAnnouncementUser(params.employeeCode);
  if (!announcementId) {
    return { status: 'error', data: 'announcementId and employeeCode are required' };
  }

  const spreadsheet = SpreadsheetApp.openById(ANNOUNCEMENT_SPREADSHEET_ID);
  const announcementSheet = getRequiredAnnouncementSheet(spreadsheet, ANNOUNCEMENTS_SHEET_NAME);
  const readSheet = getRequiredAnnouncementSheet(spreadsheet, ANNOUNCEMENT_READS_SHEET_NAME);
  const announcementIds = getSheetObjects(announcementSheet, ANNOUNCEMENTS_HEADERS)
    .map(row => String(row.AnnouncementID || ''));
  if (!announcementIds.includes(announcementId)) {
    return { status: 'error', data: 'Announcement not found' };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (getReadAnnouncementIds(readSheet, user.employeeCode).has(announcementId)) {
      return { status: 'success', data: { alreadyRead: true } };
    }
    readSheet.appendRow([announcementId, user.employeeCode, new Date()]);
  } finally {
    lock.releaseLock();
  }

  return { status: 'success', data: { alreadyRead: false } };
}

function createAnnouncement(params) {
  const user = getAnnouncementUser(params.employeeCode);
  if (user.auth.toLowerCase() !== 'admin') {
    return { status: 'error', data: 'Admin permission required' };
  }

  const title = String(params.title || '').trim();
  const message = String(params.message || '').trim();
  const type = String(params.type || 'ทั่วไป').trim();
  const targetPlant = String(params.targetPlant || '*').trim();
  const targetTeam = normalizeTargetTeam(params.targetTeam || '*');
  const startAt = parseAnnouncementDate(params.startAt);
  const endAt = parseAnnouncementDate(params.endAt);
  if (!title || !message) {
    return { status: 'error', data: 'Title and message are required' };
  }
  if (params.startAt && !startAt) {
    return { status: 'error', data: 'Invalid start date' };
  }
  if (params.endAt && !endAt) {
    return { status: 'error', data: 'Invalid end date' };
  }
  if (startAt && endAt && endAt < startAt) {
    return { status: 'error', data: 'End date must be after start date' };
  }

  const spreadsheet = SpreadsheetApp.openById(ANNOUNCEMENT_SPREADSHEET_ID);
  const sheet = getRequiredAnnouncementSheet(spreadsheet, ANNOUNCEMENTS_SHEET_NAME);
  const createdAt = new Date();
  const announcementId = Utilities.getUuid();
  sheet.appendRow([
    announcementId,
    title,
    message,
    type,
    startAt || createdAt,
    endAt || '',
    true,
    targetPlant || '*',
    createdAt,
    user.name,
    targetTeam
  ]);
  return { status: 'success', data: { AnnouncementID: announcementId } };
}

function getAnnouncementUser(employeeCodeValue) {
  const employeeCode = String(employeeCodeValue || '').trim();
  if (!employeeCode) throw new Error('Authenticated employee is required');

  const sheet = SpreadsheetApp.openById(EMPLOYEE_SPREADSHEET_ID).getSheetByName(EMPLOYEE_SHEET_NAME);
  if (!sheet) throw new Error(`Employee sheet "${EMPLOYEE_SHEET_NAME}" does not exist`);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Employee was not found');
  const headers = values[0].map(value => String(value).trim().toLowerCase());
  const codeIndex = headers.indexOf('idrec');
  const authIndex = headers.indexOf('auth');
  const nameIndex = headers.indexOf('name');
  const plantIndex = headers.indexOf('plant');
  const teamIndex = headers.indexOf('หน่วยงาน');
  if (codeIndex < 0 || authIndex < 0) throw new Error('Employee sheet must contain IDRec and Auth columns');

  const row = values.slice(1).find(item => String(item[codeIndex] || '').trim() === employeeCode);
  if (!row) throw new Error('Employee was not found');
  return {
    employeeCode,
    auth: String(row[authIndex] || '').trim(),
    name: nameIndex >= 0 ? String(row[nameIndex] || '').trim() : employeeCode,
    plant: plantIndex >= 0 ? String(row[plantIndex] || '').trim().replace(/\.0$/, '') : '',
    team: teamIndex >= 0 ? String(row[teamIndex] || '').trim() : ''
  };
}

function getRequiredAnnouncementSheet(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" does not exist. Run setupAnnouncementSheets first.`);
  return sheet;
}

function getSheetObjects(sheet, headers) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const actualHeaders = values[0].map(value => String(value).trim());
  if (!headers.every((header, index) => actualHeaders[index] === header)) {
    throw new Error(`Sheet "${sheet.getName()}" has invalid headers.`);
  }

  return values.slice(1).map(row => {
    const result = {};
    headers.forEach((header, index) => {
      const value = row[index];
      result[header] = value instanceof Date ? value.toISOString() : value;
    });
    return result;
  }).filter(row => String(row.AnnouncementID || '').trim());
}

function getReadAnnouncementIds(readSheet, employeeCode) {
  if (!employeeCode) return new Set();
  const values = readSheet.getDataRange().getValues();
  return new Set(values.slice(1)
    .filter(row => String(row[1] || '').trim() === employeeCode)
    .map(row => String(row[0] || '').trim())
    .filter(Boolean));
}

function isAnnouncementActive(row, now) {
  const active = String(row.IsActive).trim().toLowerCase();
  if (!['true', '1', 'yes', 'active', 'ใช่', 'เปิด'].includes(active)) return false;
  const startAt = parseAnnouncementDate(row.StartAt);
  const endAt = parseAnnouncementDate(row.EndAt);
  return (!startAt || startAt <= now) && (!endAt || endAt >= now);
}

function isAnnouncementForPlant(targetPlant, plant) {
  const target = String(targetPlant || '').trim();
  if (!target || target === '*') return true;
  if (!plant) return false;
  const normalize = value => {
    const normalized = String(value || '').trim().replace(/\.0$/, '');
    return /^\d+$/.test(normalized) ? normalized.padStart(4, '0') : normalized;
  };
  const userPlant = normalize(plant);
  return target.split(',').some(value => normalize(value) === userPlant);
}

function normalizeAnnouncementText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function normalizeTargetTeam(value) {
  const entries = String(value || '*')
    .split(',')
    .map(entry => entry.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (!entries.length || entries.includes('*')) return '*';
  return [...new Set(entries)].join(', ');
}

function isAnnouncementForTeam(targetTeam, team) {
  const target = normalizeTargetTeam(targetTeam);
  if (target === '*') return true;
  const userTeam = normalizeAnnouncementText(team);
  if (!userTeam) return false;
  return target.split(',').some(entry => normalizeAnnouncementText(entry) === userTeam);
}

function parseAnnouncementDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function createAnnouncementId() {
  return Utilities.getUuid();
}
