// ==== ตั้งค่า Telegram Bot ====
const BOT_TOKEN = '7787184267:AAGdxqbkQ6Xfb_G1mm_220tPNdvogGSNog4';
const CHAT_ID = '-4647742200';

const SHEET_ID = '1xyy70cq2vAxGv4gPIGiL_xA5czDXqS2i6YYqW4yEVbE'; // Request sheet ID
const SHEET_NAME = 'Request';
const ANNOUNCEMENT_SHEET_ID = '1aeGgka5ZQs3SLASOs6mOZdPJ2XotxxMbeb1-qotDZ2o';
const ANNOUNCEMENT_SHEET_NAME = 'information';

const HEADERS = [
  'timestamp', 'material', 'description', 'quantity',
  'contact', 'employeeCode', 'team', 'employeeName', 'callNumber',
  'callType', 'remark', 'status', 'vibhavadi', 'plant'
];
// whitelist origin ที่อนุญาต (เพิ่ม/แก้ได้); '*' เป็น fallback

// ========== Utils ==========
function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = { chat_id: CHAT_ID, text: message, parse_mode: 'HTML' };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function shouldNotifyTelegram(timestamp) {
  if (!timestamp) return false;
  if (typeof timestamp === 'string') {
    const cleanTs = timestamp.replace(',', '').trim();
    const parts = cleanTs.split(' ');
    const [month, day, year] = parts[0].split('/').map(Number);
    const [hour, minute, second] = (parts[1] || '0:0:0').split(':').map(Number);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      timestamp = new Date(year, month - 1, day, hour, minute, second);
    }
  }
  if (timestamp instanceof Date && !isNaN(timestamp)) {
    const tz = 'Asia/Bangkok';
    const h = +Utilities.formatDate(timestamp, tz, 'HH');
    const m = +Utilities.formatDate(timestamp, tz, 'mm');
    const total = h * 60 + m;
    return total >= 14 * 60 + 30 && total <= 15 * 60;
  }
  return false;
}

function corsResponse(obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return out;
}

// ========== Entry Points ==========
function doGet(e) { return handle(e); }
function doPost(e) { return handle(e); }
function doOptions(e) { return corsResponse({ status: 'ok' }); }

// ========== Main Handler ==========
function handle(e) {
  if (!e || (!e.parameter && !e.postData)) {
    return corsResponse({ status: 'ok' });
  }

  const params = e.parameter ? { ...e.parameter } : {};
  // รองรับกรณีส่ง JSON ตรงใน body (เช่น fetch ที่ไม่ได้ urlencoded)
  if ((!params.payload || params.payload === '') && e.postData && e.postData.contents) {
    try {
      const body = JSON.parse(e.postData.contents);
      if (body && typeof body === 'object' && body.payload && !params.payload) {
        params.payload = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload);
      }
      if (body && body.action && !params.action) {
        params.action = body.action;
      }
    } catch (err) {
      // ถ้า parse ไม่ได้ ให้ข้าม ใช้ params เดิม
    }
  }
  const action = params.action || 'getRequests';
  let response = { status: 'error', data: 'Invalid action' };

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] || [];
    const findHeaderIndex = (name) => {
      const target = (name || '').toString().trim().toLowerCase();
      return headerRow.findIndex(h => (h || '').toString().trim().toLowerCase() === target);
    };
    const idRowIndex = findHeaderIndex('IDRow');
    const materialIndex = findHeaderIndex('material');

    switch (action) {

      // ----- ดึงรายการ -----
      case 'getRequests': {
        const data = sheet.getDataRange().getValues();
        if (data.length <= 1) {
          response = { status: 'success', data: [] };
          break;
        }
        const requests = data.slice(1).map((row, idx) => {
          const obj = {};
          HEADERS.forEach((h, i) => obj[h] = row[i] || '');
          obj.row_id = idx + 2;
          obj.id = obj.row_id;
          return obj;
        }).filter(r => r.material && r.material.trim() !== '');
        response = { status: 'success', data: requests };
        break;
      }

      // ----- เพิ่มรายการ -----
      case 'insertRequest': {
        const payload = JSON.parse(params.payload || '{}');
        if (!payload.timestamp) {
          const now = new Date();
          payload.timestamp = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
        }
        if (!payload.status) payload.status = 'รอเบิก';
        if (!payload.vibhavadi) payload.vibhavadi = '';

        const rowData = HEADERS.map(h => {
          let val = payload[h] || '';
          if (h === 'plant') return "'" + val; // force text
          return val;
        });
        sheet.appendRow(rowData);
        const lastRow = sheet.getLastRow();
        payload.row_id = lastRow;
        payload.id = lastRow;

        try {
          if (shouldNotifyTelegram(payload.timestamp)) {
            const tsText = Utilities.formatDate(new Date(payload.timestamp), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm');
            const msg =
              '📦 <b>มีคำขอเบิกอะไหล่นวนครในช่วงเวลาเร่งด่วน</b>\n' +
              `เมื่อเวลา: ${tsText}\n` +
              `Material: ${payload.material || '-'}\n` +
              `Description: ${payload.description || '-'}\n` +
              `จำนวน: ${payload.quantity || '-'}\n` +
              `ผู้ร้อง: ${payload.employeeName || '-'}\n` +
              `เบอร์ติดต่อ: ${payload.contact || '-'}\n` +
              `สถานะ: ${payload.status}`;
            sendTelegramMessage(msg);
          }
        } catch (err) {
          Logger.log('Telegram error: ' + err);
        }

        response = { status: 'success', data: { message: `บันทึกเรียบร้อย (Row: ${lastRow})`, ...payload } };
        break;
      }

      // ----- อัปเดตตาม timestamp -----
      case 'updateRequest': {
        const updatePayload = JSON.parse(params.payload || '{}');
        const timestampToFind = updatePayload.timestamp;
        const newStatus = updatePayload.status || 'สั่งเบิกแล้ว';
        if (!timestampToFind) {
          response = { status: 'error', data: 'กรุณาส่ง timestamp' };
          break;
        }
        const data = sheet.getDataRange().getValues();
        const tsIndex = HEADERS.indexOf('timestamp');
        const statusIndex = HEADERS.indexOf('status');
        let updated = false;
        for (let i = 1; i < data.length; i++) {
          if (data[i][tsIndex] == timestampToFind) {
            sheet.getRange(i + 1, statusIndex + 1).setValue(newStatus);
            updated = true;
            response = { status: 'success', data: `อัปเดตแถวที่ ${i + 1} สำเร็จ (timestamp: ${timestampToFind})` };
            break;
          }
        }
        if (!updated) response = { status: 'error', data: `ไม่พบข้อมูล timestamp: ${timestampToFind}` };
        break;
      }

      // ----- อัปเดตตาม IDRow / row_id -----
      case 'updateById': {
        const updatePayload = JSON.parse(params.payload || '{}');
        const rowId = Number(updatePayload.row_id || updatePayload.id || updatePayload.IDRow || 0);
        const newStatus = updatePayload.status || 'สั่งเบิกแล้ว';
        const idRowValue = updatePayload.IDRow || updatePayload.idRow || updatePayload.IdRow || '';
        const materialValue = updatePayload.material || updatePayload.Material || '';
        const data = sheet.getDataRange().getValues();

        if (!rowId || rowId <= 1) {
          response = { status: 'error', data: 'กรุณาส่ง row_id / IDRow (มากกว่า 1)' };
          if (idRowIndex < 0 || materialIndex < 0 || idRowValue === '' || materialValue === '') {
            break;
          }
        }
        const statusIndex = HEADERS.indexOf('status');
        const lastRow = sheet.getLastRow();
        if (rowId > lastRow && (idRowIndex < 0 || materialIndex < 0)) {
          response = { status: 'error', data: `ไม่พบแถว ${rowId}` };
          break;
        }
        if (rowId > 1 && rowId <= lastRow) {
          sheet.getRange(rowId, statusIndex + 1).setValue(newStatus);
          response = { status: 'success', data: `อัปเดตแถว ${rowId} เป็น ${newStatus}` };
          break;
        }
        if (idRowIndex >= 0 && materialIndex >= 0 && idRowValue !== '' && materialValue !== '') {
          const materialValueStr = materialValue.toString().trim();
          for (let i = 1; i < lastRow; i++) {
            const rowIdCell = data[i][idRowIndex];
            const materialCell = (data[i][materialIndex] || '').toString().trim();
            if (rowIdCell == idRowValue && materialCell === materialValueStr) {
              sheet.getRange(i + 1, statusIndex + 1).setValue(newStatus);
              response = { status: 'success', data: `อัปเดต IDRow ${idRowValue} เป็น ${newStatus}` };
              return corsResponse(response);
            }
          }
        }
        response = { status: 'error', data: `ไม่พบแถว ${rowId}` };
        break;
      }

      // ----- อัปเดตหลายแถว (timestamp หรือ row_id) -----
      case 'bulkUpdateStatus': {
        const payload = JSON.parse(params.payload || '[]');
        if (!Array.isArray(payload) || payload.length === 0) {
          response = { status: 'error', data: 'payload ว่างหรือไม่ถูกต้อง' };
          break;
        }
        const data = sheet.getDataRange().getValues();
        const tsIndex = HEADERS.indexOf('timestamp');
        const statusIndex = HEADERS.indexOf('status');

        const statusRange = sheet.getRange(1, statusIndex + 1, data.length, 1);
        const statusValues = statusRange.getValues();

        let success = 0, fail = 0;
        let isModified = false;

        payload.forEach(item => {
          const ts = item.timestamp;
          const rowId = Number(item.row_id || item.id || item.IDRow || 0);
          const idRowValue = item.IDRow || item.idRow || item.IdRow || '';
          const materialValue = item.material || item.Material || '';
          const newStatus = item.status || 'สั่งเบิกแล้ว';

          let targetIndex = -1;

          if (rowId > 1 && rowId <= data.length) {
            targetIndex = rowId - 1;
          } else if (idRowIndex >= 0 && materialIndex >= 0 && idRowValue !== '' && materialValue !== '') {
            const materialValueStr = materialValue.toString().trim();
            for (let i = 1; i < data.length; i++) {
              const rowIdCell = data[i][idRowIndex];
              const materialCell = (data[i][materialIndex] || '').toString().trim();
              if (rowIdCell == idRowValue && materialCell === materialValueStr) {
                targetIndex = i;
                break;
              }
            }
          } else if (idRowIndex >= 0 && idRowValue !== '') {
            for (let i = 1; i < data.length; i++) {
              if (data[i][idRowIndex] == idRowValue) {
                targetIndex = i;
                break;
              }
            }
          } else if (ts) {
            for (let i = 1; i < data.length; i++) {
              if (data[i][tsIndex] == ts) {
                targetIndex = i;
                break;
              }
            }
          }

          if (targetIndex > 0) {
            statusValues[targetIndex][0] = newStatus;
            success++;
            isModified = true;
          } else {
            fail++;
          }
        });

        if (isModified) {
          statusRange.setValues(statusValues);
        }

        response = { status: 'success', data: { success, fail } };
        break;
      }

      // ----- อัปเดตประกาศ (Announcement) -----
      case 'updateAnnouncement': {
        const ssAnnounce = SpreadsheetApp.openById(ANNOUNCEMENT_SHEET_ID);
        const sheetAnnounce = ssAnnounce.getSheetByName(ANNOUNCEMENT_SHEET_NAME);

        const subject = params.subject || '';
        const message = params.message || '';
        const timestamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', "dd/MM/yyyy, HH:mm:ss");

        // บันทึก: [updatedAt, subject, message, updatedBy]
        sheetAnnounce.appendRow([timestamp, subject, message, 'Admin']);

        response = { status: 'success', data: 'Announcement updated' };
        break;
      }

      default:
        response = { status: 'error', data: 'Unknown action' };
    }

  } catch (error) {
    response = { status: 'error', data: error.toString() };
    Logger.log(`Error in ${action}: ${error}`);
  }

  return corsResponse(response);
}

// utility: ตั้งคอลัมน์ B เป็นข้อความ
function setColumnBtoText() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  sheet.getRange("B:B").setNumberFormat("@");
}
