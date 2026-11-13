import { apiFetch } from './api.js';
import { CONFIG } from './config.js';
import { state } from './state.js';
import { parseSafeFloat } from './utils.js';
import { loadEmployeeData } from './auth.js';

let borrowDataPromise = null;

function normalizePlant(value) {
    const plant = String(value ?? '').trim().replace(/\.0$/, '');
    return /^\d+$/.test(plant) ? plant.padStart(4, '0') : plant.toLowerCase();
}

function normalizeEmployeeId(value) {
    const id = String(value ?? '').trim().replace(/\s+/g, '');
    return id.replace(/^0+(?=\d)/, '');
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

export function loadBorrowData() {
    if (state.borrowDataLoaded) return Promise.resolve(state.borrowData);
    if (borrowDataPromise) return borrowDataPromise;

    state.borrowDataError = null;
    state.employeePhones = {};
    borrowDataPromise = apiFetch(CONFIG.ENDPOINTS.BORROW_STOCK, { cache: 'no-store' })
        .then(async borrowResponse => {
            if (!borrowResponse.ok) {
                throw new Error(`Borrow data request failed: HTTP ${borrowResponse.status}`);
            }

            const borrowRows = await borrowResponse.json();
            if (!Array.isArray(borrowRows)) {
                throw new TypeError('Borrow data API returned an invalid response');
            }

            state.borrowData = borrowRows;
            state.borrowDataLoaded = true;
            state.borrowDataError = null;

            try {
                const employees = await loadEmployeeData();
                const username = localStorage.getItem('username')?.trim();
                const currentEmployee = employees.find(employee =>
                    String(employee.IDRec ?? '').trim() === username
                );
                const isAdmin = String(currentEmployee?.Auth ?? '').trim() === 'Admin';

                if (isAdmin) {
                    const phoneResponse = await apiFetch(
                        `${CONFIG.ENDPOINTS.BORROW_STOCK}?type=phones`,
                        { cache: 'no-store' }
                    );
                    if (!phoneResponse.ok) {
                        throw new Error(`Employee phone request failed: HTTP ${phoneResponse.status}`);
                    }

                    const phoneRows = await phoneResponse.json();
                    if (!Array.isArray(phoneRows)) {
                        throw new TypeError('Employee phone API returned an invalid response');
                    }

                    const phones = {};
                    phoneRows.forEach(employee => {
                        const id = normalizeEmployeeId(employee.IDEmployee);
                        const phone = String(employee.Phone ?? '').trim();
                        if (id && phone) phones[id] = phone;
                    });
                    state.employeePhones = phones;
                }
            } catch (error) {
                console.warn('Could not load phone numbers; borrow details remain available:', error);
            }

            return borrowRows;
        }).catch(error => {
            state.borrowDataError = error;
            borrowDataPromise = null;
            throw error;
        }).finally(() => {
            if (state.borrowDataLoaded) borrowDataPromise = null;
        });

    return borrowDataPromise;
}

export function getBorrowRows(material) {
    const userPlant = normalizePlant(localStorage.getItem('userPlant'));
    const normalizedMaterial = String(material ?? '').trim();
    if (!userPlant || !normalizedMaterial) return [];

    return state.borrowData.filter(row =>
        String(row.Material ?? '').trim() === normalizedMaterial &&
        normalizePlant(row.Plant) === userPlant
    );
}

export function getBorrowTotal(material) {
    return getBorrowRows(material).reduce((total, row) => total + parseSafeFloat(row['จำนวน']), 0);
}

async function createReturnAnnouncement(row, material) {
    const team = String(row['หน่วยงาน'] ?? '').trim();
    if (!team) throw new Error('ไม่พบทีมของรายการนี้ จึงไม่สามารถส่งประกาศได้');

    const materialCode = String(row.Material || material || '').trim();
    const description = String(row.Description || '').trim() || '-';
    const quantity = parseSafeFloat(row['จำนวน']).toLocaleString();
    const employeeName = String(row['ชื่อ'] || '').trim() || '-';
    const title = `ขอคืนอะไหล่ ${materialCode}`;
    const message = `ขอคืนอะไหล่ ${materialCode} ${description} จำนวน ${quantity} ชิ้น ${employeeName} ${team} รบกวนทีมติดต่อช่างเพื่อส่งคืนออะไหล่ดังกล่าว ขอบคุณครับ`;
    const body = new URLSearchParams({
        action: 'createAnnouncement',
        title,
        message,
        type: 'ทั่วไป',
        startAt: '',
        endAt: '',
        targetPlant: String(row.Plant || localStorage.getItem('userPlant') || '*'),
        targetTeam: team,
        targetEmployeeCodes: ''
    });
    const response = await apiFetch('/api/gas-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || error.data || `HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result.status !== 'success') {
        throw new Error(typeof result.data === 'string' ? result.data : 'สร้างประกาศไม่สำเร็จ');
    }
}

export async function showBorrowPopup(material) {
    try {
        await loadBorrowData();
    } catch (error) {
        console.error('Failed to load borrow details:', error);
        await Swal.fire({
            icon: 'error',
            title: 'โหลดรายการค้างยืมไม่สำเร็จ',
            text: 'กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่อีกครั้ง',
            confirmButtonText: 'ปิด'
        });
        return;
    }

    const rows = getBorrowRows(material);
    if (!rows.length) {
        await Swal.fire({
            icon: 'info',
            title: 'รายการค้างยืม',
            text: 'ไม่พบรายการค้างยืมของอะไหล่นี้ใน Plant ของคุณ',
            confirmButtonText: 'ปิด'
        });
        return;
    }

    let canViewPhoneNumbers = false;
    try {
        const employees = await loadEmployeeData();
        const username = localStorage.getItem('username')?.trim();
        const currentEmployee = employees.find(employee =>
            String(employee.IDRec ?? '').trim() === username
        );
        canViewPhoneNumbers = String(currentEmployee?.Auth ?? '').trim() === 'Admin';
    } catch (error) {
        console.warn('Could not verify Admin access for borrow phone numbers:', error);
    }

    const sortedRows = rows.slice().sort((a, b) => {
        const departmentA = String(a['หน่วยงาน'] ?? '').trim() || 'ไม่ระบุหน่วยงาน';
        const departmentB = String(b['หน่วยงาน'] ?? '').trim() || 'ไม่ระบุหน่วยงาน';
        const departmentOrder = departmentA.localeCompare(departmentB, 'th');
        return departmentOrder || parseSafeFloat(b['จำนวน']) - parseSafeFloat(a['จำนวน']);
    });
    const rowsHtml = sortedRows.map((row, index) => {
        const employeeId = normalizeEmployeeId(row['Employee ID']);
        const phone = state.employeePhones[employeeId] || '';
        const safePhone = phone.replace(/[^\d+]/g, '');
        const phoneLink = canViewPhoneNumbers && safePhone
            ? `<a class="borrow-phone-link" href="tel:${escapeHtml(safePhone)}" aria-label="โทร ${escapeHtml(phone)}" title="โทร ${escapeHtml(phone)}"><i class="fas fa-phone-alt" aria-hidden="true"></i></a>`
            : '';
        const team = String(row['หน่วยงาน'] ?? '').trim();
        const department = team || 'ไม่ระบุทีม';
        const returnAction = canViewPhoneNumbers
            ? `<td class="borrow-action-cell"><button class="borrow-return-button" type="button" data-row-index="${index}"${team ? '' : ' disabled'}>ขอคืน</button><span class="borrow-return-feedback" role="status" aria-live="polite">${team ? '' : 'ไม่ระบุทีม'}</span></td>`
            : '';
        return `
            <tr>
                <td class="borrow-row-number">${index + 1}</td>
                <td class="borrow-phone-cell">${phoneLink}</td>
                <td>${escapeHtml(row['ชื่อ'] || '-')}</td>
                <td>${escapeHtml(department)}</td>
                <td class="borrow-quantity">${parseSafeFloat(row['จำนวน']).toLocaleString()}</td>
                ${returnAction}
            </tr>`;
    }).join('');
    const actionHeader = canViewPhoneNumbers ? '<th>Action</th>' : '';
    const detailsHtml = `
        <p class="borrow-description">${escapeHtml(rows[0].Description || '-')}</p>
        <div class="borrow-table-wrap">
            <table class="borrow-detail-table${canViewPhoneNumbers ? ' borrow-detail-table-admin' : ''}">
                <thead><tr><th>#</th><th></th><th>ชื่อ</th><th>ทีม</th><th>จำนวน</th>${actionHeader}</tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;

    await Swal.fire({
        title: `รายการค้างยืม · ${escapeHtml(material)}`,
        html: `<div class="borrow-popup-content">${detailsHtml}</div>`,
        width: 'min(900px, 95vw)',
        confirmButtonText: 'ปิด',
        customClass: { popup: 'borrow-popup' },
        didOpen: popup => {
            popup.querySelectorAll('.borrow-return-button:not(:disabled)').forEach(button => {
                button.addEventListener('click', async () => {
                    const row = sortedRows[Number(button.dataset.rowIndex)];
                    const feedback = button.nextElementSibling;
                    if (!row || !feedback) return;

                    button.disabled = true;
                    button.textContent = 'กำลังส่ง';
                    feedback.textContent = '';
                    try {
                        await createReturnAnnouncement(row, material);
                        button.textContent = 'ส่งแล้ว';
                        button.classList.add('borrow-return-success');
                        feedback.textContent = 'ส่งประกาศขอคืนแล้ว';
                    } catch (error) {
                        console.error('Failed to send borrow return announcement:', error);
                        button.disabled = false;
                        button.textContent = 'ลองอีกครั้ง';
                        feedback.textContent = `ส่งไม่สำเร็จ: ${error.message || 'กรุณาลองใหม่'}`;
                    }
                });
            });
        }
    });
}
