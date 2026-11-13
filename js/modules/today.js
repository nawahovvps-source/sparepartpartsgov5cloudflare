import { apiFetch } from '../api.js';
import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { hideLoading, showDetailModal, renderPagination } from '../ui.js';
import { sortByColumn, parseSafeFloat, getStorageBinValue } from '../utils.js';
import { loadImageDatabase, loadData } from './parts.js?v=40';

let todayFetchController = null;

// Re-implement loadTodayData with full logic from main.js
export async function loadTodayData(options = {}) {
    const { silent = false } = options;
    if (todayFetchController) {
        todayFetchController.abort();
    }

    const controller = new AbortController();
    todayFetchController = controller;
    let timeoutId = null;

    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const savedUsername = localStorage.getItem('username');
    if (!isLoggedIn || !savedUsername) {
        const loadEl = document.getElementById("loadingToday");
        if (loadEl) loadEl.style.display = "none";
        return;
    }

    if (!silent) {
        document.getElementById("loading").style.display = "flex";
        const loadingToday = document.getElementById("loadingToday");
        if (loadingToday) loadingToday.style.display = "block";
    } else {
        // Show non-intrusive icon
        const syncIcon = document.getElementById("backgroundSyncIcon");
        if (syncIcon) syncIcon.style.display = "inline-block";
    }

    const errorContainer = document.getElementById("error-container-today"); // Assume id
    if (errorContainer) errorContainer.style.display = "none";

    try {
        timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await apiFetch(`${CONFIG.ENDPOINTS.REQUEST_SHEET_BASE}?type=all`, {
            signal: controller.signal,
            cache: 'no-store'
        });

        // Load image DB and Parts Data (for stock) in parallel or sequence
        loadImageDatabase().catch(err => console.warn("Background Image DB load failed", err));
        loadData({ render: false }).catch(err => console.warn("Background Parts DB load failed", err));

        clearTimeout(timeoutId);


        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        // Strategy: Preserve optimistic 'temp_' rows from local state
        // because the API might be slow to reflect the new insert.
        const currentTemps = state.todayData
            ? state.todayData.filter(r => String(r.row_id).startsWith('temp_'))
            : [];

        const normalizedData = (Array.isArray(data) ? data : []).map((row, index) => {
            const rowId = row.row_id || row.id || (index + 2);
            return { ...row, row_id: rowId, id: row.id || rowId };
        });

        // Smart Merge: Filter out temps that seemingly match a new real row
        const nonDuplicatedTemps = currentTemps.filter(temp => {
            // 1. Try strict match by Call Number (if available)
            if (temp.CallNumber) {
                const callMatch = normalizedData.find(real =>
                    String(real.CallNumber).trim() === String(temp.CallNumber).trim() &&
                    String(real.Material) === String(temp.Material)
                );
                if (callMatch) return false; // Found match, discard temp
            }

            // 2. Fuzzy match for items without Call Number (or if Call Number match failed)
            // Match: Material + Employee + Quantity (Case Insensitive)
            const match = normalizedData.find(real => {
                const realMat = (real.Material || real.material || '').toString().trim();
                const tempMat = (temp.Material || temp.material || '').toString().trim();
                const sameMat = realMat.toLowerCase() === tempMat.toLowerCase();

                const realName = (real.EmployeeName || real.employeeName || '').toString().trim();
                const tempName = (temp.EmployeeName || temp.employeeName || '').toString().trim();
                const sameName = realName.toLowerCase() === tempName.toLowerCase();

                const realQty = parseSafeFloat(real.Quantity || real.quantity);
                const tempQty = parseSafeFloat(temp.Quantity || temp.quantity);
                const sameQty = realQty === tempQty;

                return sameMat && sameName && sameQty;
            });
            return !match; // Keep temp if NO match found
        });

        state.todayData = [...nonDuplicatedTemps, ...normalizedData];
        state.currentPageToday = 1;
        state.todayDataLoaded = true;

        updateTableToday();
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error("Load today failed", error);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
        if (loadingToday) loadingToday.style.display = "none";
        if (!silent) hideLoading();

        // Hide non-intrusive icon
        const syncIcon = document.getElementById("backgroundSyncIcon");
        if (syncIcon) syncIcon.style.display = "none";
    }
}

// Helper to get stock maps from state.allData

// Helper to get stock maps from state.allData
let cachedStockMaps = null;
let lastAllDataLength = 0;

function getStockMaps() {
    // Return cached if valid
    if (cachedStockMaps && state.allData && state.allData.length === lastAllDataLength) {
        return cachedStockMaps;
    }

    // Recalculate
    const vMap = {};
    const nMap = {};
    const binMap = {};
    if (state.allData) {
        state.allData.forEach(row => {
            const mat = (row.Material || "").toString().trim();
            if (mat) {
                vMap[mat] = parseSafeFloat(row["วิภาวดี"]);
                nMap[mat] = parseSafeFloat(row["Unrestricted"]);
                binMap[mat] = getStorageBinValue(row) || "-";
            }
        });
        lastAllDataLength = state.allData.length;
        cachedStockMaps = { vMap, nMap, binMap };
    } else {
        return { vMap: {}, nMap: {}, binMap: {} };
    }
    return cachedStockMaps;
}

// Helper from main.js
function formatTimestamp(dateTimeStr) {
    if (!dateTimeStr) return "";
    let trimmed = dateTimeStr.toString().trim();

    // ISO String check
    if (trimmed.match(/^\d{4}-\d{2}-\d{2}T/)) {
        const d = new Date(trimmed);
        if (!isNaN(d)) {
            trimmed = d.toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour12: false });
        }
    }

    const parts = trimmed.split(' ');
    let datePart = parts[0] || "";
    datePart = datePart.replace(',', '');
    const timePart = parts[1] || "";

    // Check DD/MM/YYYY
    const dateMatch = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!dateMatch) return trimmed;

    const a = parseInt(dateMatch[1], 10);
    const b = parseInt(dateMatch[2], 10);
    const y = parseInt(dateMatch[3], 10);
    if (!a || !b || !y) return trimmed;

    // Logic from main.js: isMonthFirst = a <= 12 && b > 12
    const isMonthFirst = a <= 12 && b > 12;
    const day = isMonthFirst ? b : a;
    const month = isMonthFirst ? a : b;
    const yearBE = y + 543;

    const formattedDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${yearBE}`;
    const formattedTime = timePart ? ` ${timePart}` : '';
    return `${formattedDate}${formattedTime}`;
}

export function updateTableToday() {
    const tableBody = document.querySelector("#data-table-today tbody");
    if (!tableBody) return;

    // Filter logic
    let filtered = state.todayData;
    const userPlant = localStorage.getItem('userPlant') || '';
    if (userPlant && userPlant !== 'None') {
        filtered = filtered.filter(row => (row.plant || row.Plant || '').toString().trim() === userPlant);
    }
    else {
        const userAuth = localStorage.getItem('userAuth');
        if (userAuth !== 'Admin') filtered = [];
    }

    // Filter by pending vs all
    if (state.showOnlyPending) {
        const now = new Date();
        const cutoffTime = new Date(now);
        cutoffTime.setDate(cutoffTime.getDate() - 1);
        cutoffTime.setHours(14, 50, 0, 0);

        filtered = filtered.filter(row => {
            const tsStr = (row.timestamp || row.Timestamp || "").toString();
            if (!tsStr) return false;

            let rowDate = null;
            const parts = tsStr.trim().split(' ');
            if (parts.length >= 2) {
                const dateParts = parts[0].split('/');
                const timeParts = parts[1].split(':');
                if (dateParts.length === 3) {
                    let p1 = parseInt(dateParts[0], 10);
                    let p2 = parseInt(dateParts[1], 10);
                    let m, d;
                    if (p1 > 12) { d = p1; m = p2 - 1; }
                    else { m = p1 - 1; d = p2; }
                    let y = parseInt(dateParts[2], 10);
                    if (y > 2400) y -= 543;

                    let h = parseInt(timeParts[0], 10) || 0;
                    let min = parseInt(timeParts[1], 10) || 0;
                    let s = timeParts[2] ? parseInt(timeParts[2], 10) : 0;
                    rowDate = new Date(y, m, d, h, min, s);
                }
            }

            if (!rowDate || isNaN(rowDate.getTime())) {
                const d = new Date(tsStr);
                if (!isNaN(d.getTime())) rowDate = d;
            }

            if (rowDate && !isNaN(rowDate.getTime())) {
                const isPending = (row.status || "").trim() === "รอเบิก";
                return (rowDate >= cutoffTime) || isPending;
            }
            return false;
        });
    }


    // Search filter
    const searchInput = document.getElementById("searchInputToday");
    if (searchInput && searchInput.value.trim()) {
        const k = searchInput.value.trim().toLowerCase();
        filtered = filtered.filter(row =>
            Object.values(row).some(v => String(v).toLowerCase().includes(k))
        );
    }

    // Sort Logic
    if (state.sortConfigToday && state.sortConfigToday.column) {
        filtered.sort((a, b) => sortByColumn(a, b, state.sortConfigToday.column, state.sortConfigToday.direction));
    }

    state.currentFilteredDataToday = filtered;

    // Render
    const itemsPerPage = 20;
    const start = (state.currentPageToday - 1) * itemsPerPage;
    const slice = filtered.slice(start, start + itemsPerPage);

    // Calculate stock maps
    const { vMap, nMap, binMap } = getStockMaps();

    tableBody.innerHTML = '';

    // Manage Header Visibility for Admin Features
    const userAuth = localStorage.getItem('userAuth');
    const thSelect = document.getElementById('th-select-today');
    const thPrint = document.getElementById('th-print-today');
    if (thSelect) thSelect.style.display = (userAuth === 'Admin') ? '' : 'none';
    if (thPrint) thPrint.style.display = (userAuth === 'Admin') ? '' : 'none';

    if (slice.length === 0) {
        tableBody.innerHTML = '<tr class="today-empty-row"><td colspan="18" style="text-align:center">ไม่พบข้อมูล</td></tr>';
        const pageContainer = document.getElementById("pageNumbersToday");
        if (pageContainer) pageContainer.innerHTML = '';
        return;
    }

    const columnLabels = [
        'เลือก', 'Print', 'Status', 'ลำดับ', 'รูป', 'วันเวลา', 'Material', 'Description',
        'Storage bin', 'จำนวนสั่ง', 'คงเหลือ', 'นวนคร', 'ชื่อช่าง', 'หน่วยงาน', 'Call',
        'CallType', 'หมายเหตุ', 'Plant'
    ];

    slice.forEach(row => {
        const tr = document.createElement("tr");
        tr.classList.add(userAuth === 'Admin' ? 'today-admin-row' : 'today-user-row');

        // 1. Checkbox (Admin Only)
        const selectTd = document.createElement("td");
        if (userAuth === 'Admin') {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "row-checkbox"; 
            if (state.selectedTodayRows.has(row.row_id)) checkbox.checked = true;
            checkbox.onclick = (e) => {
                e.stopPropagation();
                if (checkbox.checked) state.selectedTodayRows.add(row.row_id);
                else state.selectedTodayRows.delete(row.row_id);
            };
            selectTd.appendChild(checkbox);
            selectTd.style.display = '';
        } else {
            selectTd.style.display = 'none';
        }
        tr.appendChild(selectTd);
        
        // 2. Sticker Button (Print) - Admin Only
        const actionTd = document.createElement('td');
        if (userAuth === 'Admin') {
            const btn = document.createElement('button');
            btn.className = 'sticker-btn'; 
            btn.innerHTML = '<i class="fas fa-barcode"></i>'; 
            btn.title = 'สร้างสติ๊กเกอร์ 80x100 mm';
            btn.onclick = (e) => {
                e.stopPropagation(); 
                const mat = (row.Material || row.material || "").toString().trim();
                const { binMap } = getStockMaps();
                const storageBin = binMap[mat] || "-";

                const stickerData = {
                    timestamp: formatTimestamp(row.Timestamp || row.timestamp),
                    material: mat,
                    description: row.Description || row.description || "-",
                    storageBin: storageBin,
                    quantity: (row.Quantity || row.quantity || "0").toString(),
                    employee: row.EmployeeName || row.employeeName || "-",
                    team: row.Team || row.team || "-",
                    call: row.CallNumber || row.callNumber || "-",
                    callType: row.CallType || row.callType || "-",
                    remark: row.Remark || row.remark || ""
                };

                showStickerPreview(stickerData);
            };
            actionTd.appendChild(btn);
            actionTd.style.display = '';
        } else {
            actionTd.style.display = 'none';
        }
        tr.appendChild(actionTd);

        // 2. Status
        const statusTd = document.createElement("td");
        const status = row.status || row.Status || '';
        const statusBadge = document.createElement('span');
        statusBadge.className = 'today-status-badge';
        if (status === 'รอเบิก') {
            statusBadge.classList.add('today-status-pending');
        } else if (status === 'สั่งเบิกแล้ว') {
            statusBadge.classList.add('today-status-issued');
        } else if (status === 'ยกเลิก') {
            statusBadge.classList.add('today-status-cancelled');
        } else {
            statusBadge.classList.add('today-status-other');
        }
        statusBadge.textContent = status || '-';
        statusTd.className = 'today-status-cell';
        statusTd.appendChild(statusBadge);
        const statusRowId = row.row_id || row.id || row.IDRow || row.idRow || '';
        if (status === 'รอเบิก' && !String(statusRowId).startsWith('temp_')) {
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'today-cancel-button today-status-badge today-status-cancelled';
            cancelButton.textContent = 'ยกเลิก';
            cancelButton.title = 'ยกเลิกรายการเบิกนี้';
            cancelButton.setAttribute('aria-label', 'ยกเลิกรายการเบิกนี้');
            cancelButton.addEventListener('click', event => {
                event.stopPropagation();
                cancelTodayRequest(row);
            });
            statusTd.appendChild(cancelButton);
        }
        tr.appendChild(statusTd);

        // 3. IDRow
        const idTd = document.createElement("td");
        let displayId = row.IDRow || row.idRow || row.row_id || "";
        if (String(displayId).startsWith('temp_')) {
            displayId = '⏳'; // Pending icon or "..."
            idTd.title = "กำลังรอ Server ID...";
        }
        idTd.textContent = displayId;
        tr.appendChild(idTd);

        // 4. Image Logic (Inline creation matching main.js createTodayImageCell logic)
        const imgTd = document.createElement("td");
        imgTd.style.textAlign = "center";
        const mat = (row.Material || row.material || "").toString().trim();
        const directId = (row.imageId || row.ImageId || row.image || row.Image || "0").toString().trim();
        let fileId = "";

        if (directId.length > 5 && directId !== "0") {
            fileId = directId;
        } else if (mat && state.imageDatabase[mat] && state.imageDatabase[mat].length > 0) {
            fileId = state.imageDatabase[mat][0];
        } else {
            const urlCandidate = row.UrlWeb || row.urlWeb || row.urlweb || row.Url || row.url || "";
            const match = urlCandidate.match(/\/d\/([a-zA-Z0-9-_]+)/) || urlCandidate.match(/id=([a-zA-Z0-9-_]+)/);
            if (match && match[1]) fileId = match[1];
        }

        if (fileId && fileId !== "0") {
            const imgDiv = document.createElement("div");
            imgDiv.style.display = "inline-flex";
            imgDiv.style.cursor = "pointer";
            imgDiv.onclick = () => {
                // Open simple image modal
                const modal = document.getElementById('imageModal');
                const content = document.getElementById('imageModalContent');
                if (modal && content) {
                    content.innerHTML = `<img src="https://drive.google.com/thumbnail?id=${fileId}&sz=s1200" referrerpolicy="no-referrer" style="max-width:100%; max-height:80vh;">`;
                    modal.style.display = "block";
                }
            };
            const img = document.createElement("img");
            img.setAttribute("referrerpolicy", "no-referrer");
            img.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=s100`;
            img.style.width = "40px";
            img.style.height = "40px";
            img.style.objectFit = "cover";
            img.style.borderRadius = "4px";
            img.loading = "lazy";
            imgDiv.appendChild(img);
            imgTd.appendChild(imgDiv);
        } else {
            imgTd.textContent = "-";
        }
        tr.appendChild(imgTd);

        // 5. Columns Loop
        const columns = [
            "Timestamp", "material", "description", "storageBin", "quantity",
            "vibhavadi", "navanakorn",
            "employeeName", "team", "CallNumber", "CallType", "remark"
        ];

        columns.forEach(col => {
            const td = document.createElement("td");
            // Normalize key access
            const key = col === "material" ? "Material" :
                col === "description" ? "Description" :
                    col === "quantity" ? "Quantity" :
                        col === "employeeName" ? "EmployeeName" :
                            col === "team" ? "Team" :
                                col === "remark" ? "Remark" :
                                    col === "vibhavadi" ? "วิภาวดี" :
                                        col === "navanakorn" ? "Unrestricted" :
                                            col === "storageBin" ? "storageBin" : col; // placeholder for storageBin
            // Wait, main.js uses navanakornStockMap for "navanakorn" column, which usually maps to "Unrestricted" in data?
            // In loadVibhavadiStockMap: navanakorn = parseInt(row["Unrestricted"] || 0, 10);

            let val = row[key] || row[col] || "";

            // Special handling
            if (col === "vibhavadi") {
                const realStock = vMap[mat]; // Using lookup map
                val = (realStock !== undefined) ? realStock.toLocaleString() : "0";
                td.style.color = (realStock > 0) ? "#27ae60" : "#e74c3c";
                td.style.fontWeight = "bold";
            }
            if (col === "navanakorn") {
                const realStock = nMap[mat];
                val = (realStock !== undefined) ? realStock.toLocaleString() : "0";
                td.style.color = (realStock > 0) ? "#2196f3" : "#e74c3c";
                td.style.fontWeight = "bold";
            }
            if (col === "storageBin") {
                val = binMap[mat] || "-";
            }
            if (col === "Timestamp") {
                val = formatTimestamp(val);
            }
            if (col === "quantity") {
                if (val && !isNaN(val)) val = Number(val).toLocaleString();
            }
            if (col === "description") {
                td.style.textAlign = "left";
            }

            // Remark and Bold Logic
            const rmk = (row.remark || row.Remark || "").toString().trim();
            if (rmk !== "") {
                if (col === "remark" || col === "material" || col === "description" || col === "Timestamp") {
                    td.style.color = "#d32f2f";
                    td.style.fontWeight = "bold";
                }
            }
            // Vibhavadi green override if just value present? main.js says if (col === "vibhavadi" && value) green
            // But we handled it above with realStock check.

            // Admin Call Technician Feature
            if (col === "employeeName") {
                const userAuth = localStorage.getItem('userAuth');
                let contact = (row.contact || row.Contact || row.Tel || row.tel || "").toString().trim();

                if (userAuth === 'Admin' && contact) {
                    if (!contact.startsWith('0')) {
                        contact = '0' + contact;
                    }

                    td.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span>${val}</span>
                            <a href="tel:${contact}" style="color:#2ecc71; text-decoration:none; font-size:1.1em;" title="โทร: ${contact}" onclick="event.stopPropagation()">
                                <i class="fas fa-phone"></i>
                            </a>
                        </div>
                    `;
                    tr.appendChild(td);
                    return; // Skip default textContent assignment
                }
            }

            if (col === "team") {
                const teamContent = document.createElement('span');
                teamContent.className = 'today-team-content';

                const teamName = document.createElement('span');
                teamName.textContent = val || '-';
                teamContent.appendChild(teamName);

                td.appendChild(teamContent);
                tr.appendChild(td);
                return;
            }

            td.textContent = val;
            tr.appendChild(td);
        });

        // 16. Plant
        const plantTd = document.createElement("td");
        plantTd.textContent = row.plant || row.Plant || '-';
        tr.appendChild(plantTd);

        tr.querySelectorAll('td').forEach((cell, index) => {
            cell.dataset.label = columnLabels[index];
        });

        tableBody.appendChild(tr);
    });

    // Pagination
    renderPagination(state.currentFilteredDataToday.length, state.currentPageToday, "pageNumbersToday", itemsPerPage, "Today");
}

async function cancelTodayRequest(row) {
    const confirmation = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันยกเลิกรายการ?',
        text: `ยกเลิกรายการ ${row.Material || row.material || ''}`,
        showCancelButton: true,
        confirmButtonText: 'ยืนยันยกเลิก',
        cancelButtonText: 'กลับ',
        confirmButtonColor: '#d64545',
        cancelButtonColor: '#718096',
        reverseButtons: true
    });
    if (!confirmation.isConfirmed) return;

    const rowIdRaw = row.row_id || row.id || row.IDRow || row.idRow || '';
    const payload = [{
        row_id: Number(rowIdRaw) || '',
        IDRow: row.IDRow || row.idRow || row.IdRow || '',
        material: row.material || row.Material || '',
        timestamp: row.timestamp || row.Timestamp || row['Timestamp'] || '',
        status: 'ยกเลิก'
    }];

    Swal.fire({
        title: 'กำลังยกเลิกรายการ',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const response = await apiFetch(CONFIG.ENDPOINTS.GAS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `action=bulkUpdateStatus&payload=${encodeURIComponent(JSON.stringify(payload))}`
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const result = await response.json();
        const updateResult = result.data;
        if (result.status !== 'success' || Number(updateResult?.success) !== 1 || Number(updateResult?.fail) !== 0) {
            throw new Error(typeof updateResult === 'string' ? updateResult : 'ไม่สามารถอัปเดตสถานะได้');
        }

        const verifiedUpdates = await verifyTodayStatusUpdates(payload);
        if (!verifiedUpdates[0]) {
            throw new Error('ส่งคำขอแล้ว แต่ยังยืนยันสถานะ "ยกเลิก" จากฐานข้อมูลไม่ได้ กรุณารีเฟรชและตรวจสอบ');
        }

        row.status = 'ยกเลิก';
        if ('Status' in row) row.Status = 'ยกเลิก';
        state.selectedTodayRows.delete(row.row_id);
        updateTableToday();
        await Swal.fire({
            icon: 'success',
            title: 'บันทึกการยกเลิกแล้ว',
            text: `Material: ${row.Material || row.material || '-'}\nสถานะ: ยกเลิก\nบันทึกลงฐานข้อมูลเรียบร้อย`
        });
    } catch (error) {
        console.error('Failed to cancel today request:', error);
        await Swal.fire({
            icon: 'error',
            title: 'ยกเลิกรายการไม่สำเร็จ',
            text: error.message || 'กรุณาลองใหม่อีกครั้ง'
        });
    }
}


// --- Helper: Get Row Key (Ported from main.js) ---
function getTodayRowKey(row) {
    const rowIdRaw = row.row_id || row.id || row.IDRow || row.idRow || row.IdRow || '';
    if (rowIdRaw !== '') {
        return `id:${rowIdRaw}`;
    }
    const idRow = row.IDRow || row.idRow || '';
    const timestamp = row.timestamp || row.Timestamp || '';
    const material = row.material || row.Material || '';
    return `fallback:${idRow}|${timestamp}|${material}`;
}

// --- Helper: Get Selected Rows ---
function getSelectedTodayRows() {
    const checkboxes = document.querySelectorAll('.row-checkbox:checked');
    if (!checkboxes.length) return [];
    const rowMap = new Map();
    state.todayData.forEach(row => {
        rowMap.set(getTodayRowKey(row), row);
    });
    // Note: logic in render uses local checkbox state, but here we query DOM or use state set
    // In renderTableToday (lines 230+) we update state.selectedTodayRows
    // So best to filter state.todayData by state.selectedTodayRows
    if (state.selectedTodayRows.size > 0) {
        return state.todayData.filter(row => state.selectedTodayRows.has(row.row_id));
    }
    return [];
}

// --- Export Data ---
export function exportTodayData() {
    const sourceData = (state.currentFilteredDataToday && state.currentFilteredDataToday.length > 0)
        ? state.currentFilteredDataToday
        : state.todayData;

    // Filter for "Waiting for Pickup" (รอเบิก)
    const data = sourceData.filter(row => (row.status || row.Status || '').trim() === 'รอเบิก');

    if (!data || data.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'ไม่มีข้อมูลสำหรับ Export',
            text: 'ไม่พบรายการที่มีสถานะ "รอเบิก"',
            timer: 1600,
            showConfirmButton: false
        });
        return;
    }

    const materialMap = new Map();
    data.forEach(row => {
        const material = (row.material || row.Material || '').toString().trim();
        if (!material) return;
        const description = (row.description || row.Description || '').toString().trim();
        const quantityValue = parseSafeFloat(row.quantity || row.Quantity);

        // Create a unique key for aggregation to prevent duplicates in export
        // Key: Material + CallNumber (if exists) + Employee? 
        // Actually, for "Total Quantity Per Material", we usually just want Material. 
        // But if the user wants strictly line items...
        // The user said: "จะนำจำนวนมารวมกัน" (will sum the quantities).
        // So they accept summing by Material is okay, OR they mean the duplicates cause double summing.
        // If we sum by Material, we solve the duplicate row issue automatically for the export context.

        const entry = materialMap.get(material);
        if (!entry) {
            materialMap.set(material, {
                material,
                description,
                quantity: isNaN(quantityValue) ? 0 : quantityValue
            });
        } else {
            entry.quantity += isNaN(quantityValue) ? 0 : quantityValue;
            if (!entry.description && description) {
                entry.description = description;
            }
        }
    });

    const columns = [
        { key: "material", label: "material" },
        { key: "description", label: "description" },
        { key: "quantity", label: "quantity" },
        { key: "storage", label: "Storage bin" }
    ];

    const csvRows = [];
    csvRows.push(columns.map(col => `"${col.label}"`).join(','));

    Array.from(materialMap.values()).forEach(item => {
        const values = columns.map(col => {
            let value = '';
            if (col.key === 'storage') {
                const { binMap } = getStockMaps();
                value = binMap[item.material] || "-";
            } else if (col.key === 'quantity') {
                value = item.quantity;
            } else {
                value = item[col.key] || '';
            }
            const safeValue = value.toString().replace(/"/g, '""').replace(/\r?\n/g, ' ');
            return `"${safeValue}"`;
        });
        csvRows.push(values.join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `today-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// --- Save Data Snapshot ---
async function verifyTodayStatusUpdates(payload) {
    const response = await apiFetch(
        `${CONFIG.ENDPOINTS.GAS}?action=getRequests&v=${Date.now()}`,
        { cache: 'no-store' }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    const rows = result.data;
    if (result.status !== 'success' || !Array.isArray(rows)) {
        throw new Error('ข้อมูลยืนยันผลการบันทึกไม่ถูกต้อง');
    }

    return payload.map(item => {
        const rowId = Number(item.row_id);
        const index = rows.findIndex((row, rowIndex) => {
            const currentRowId = Number(row.row_id || row.id || rowIndex + 2);
            if (rowId > 1) {
                if (currentRowId !== rowId) return false;
            } else if (item.timestamp) {
                const timestamp = row.timestamp || row.Timestamp || row['Timestamp'] || '';
                if (String(timestamp).trim() !== String(item.timestamp).trim()) return false;
            } else if (item.IDRow) {
                const currentIdRow = row.IDRow || row.idRow || row.IdRow || '';
                if (String(currentIdRow).trim() !== String(item.IDRow).trim()) return false;
            } else {
                return false;
            }

            const material = row.material || row.Material || '';
            return !item.material || String(material).trim() === String(item.material).trim();
        });
        if (index < 0) return false;

        const status = rows[index].status || rows[index].Status || '';
        return status === item.status;
    });
}

export async function saveTodayDataSnapshot() {
    // Use selected rows if any, otherwise filtered/all
    let data = getSelectedTodayRows();
    if (data.length === 0) {
        data = (state.currentFilteredDataToday && state.currentFilteredDataToday.length > 0)
            ? state.currentFilteredDataToday
            : state.todayData;
    }

    const pendingRows = data.filter(row => (row.status || row.Status || '').trim() === 'รอเบิก');

    if (pendingRows.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'ไม่มีรายการรอเบิก',
            text: 'ไม่พบสถานะ "รอเบิก" สำหรับปรับเป็น "สั่งเบิกแล้ว"',
            timer: 1600,
            showConfirmButton: false
        });
        return;
    }

    Swal.fire({
        title: 'ยืนยันเปลี่ยนสถานะ?',
        html: `จะส่ง ${pendingRows.length} รายการไปอัปเดตเป็น "สั่งเบิกแล้ว"`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (!result.isConfirmed) return;

        // --- Optimistic UI Update (Background Mode) ---

        // 1. Create a snapshot for rollback
        const originalStatusMap = new Map();
        pendingRows.forEach(row => {
            originalStatusMap.set(row.row_id, row.status || row.Status);
            // Optimistically update
            row.status = 'สั่งเบิกแล้ว';
            if (row.Status) row.Status = 'สั่งเบิกแล้ว';
        });

        state.selectedTodayRows.clear();

        // Fix: Explicitly uncheck the header checkbox
        const selectAllCheckbox = document.getElementById('selectAllToday');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        updateTableToday(); // Reflect immediately

        // 2. Show non-blocking toast
        const toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            customClass: {
                popup: 'premium-toast',
                title: 'premium-toast-title',
                icon: 'premium-toast-icon'
            },
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer)
                toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
        });
        toast.fire({
            icon: 'info',
            title: 'กำลังบันทึกข้อมูลในเบื้องหลัง...'
        });

        // 3. Prepare Payload
        const payload = pendingRows.map(row => {
            const rowIdRaw = row.row_id || row.id || row.IDRow || row.idRow || '';
            const rowId = Number(rowIdRaw) || '';
            return {
                row_id: rowId,
                IDRow: row.IDRow || row.idRow || row.IdRow || '',
                material: row.material || row.Material || '',
                timestamp: row.timestamp || row.Timestamp || row["Timestamp"] || '',
                status: 'สั่งเบิกแล้ว'
            };
        });

        const bulkUpdateUrl = '/api/gas';

        // 4. Send Request in Background
        (async () => {
            try {
                // Try standard fetch first
                let res;
                try {
                    res = await apiFetch(bulkUpdateUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `action=bulkUpdateStatus&payload=${encodeURIComponent(JSON.stringify(payload))}`
                    });
                } catch (corsErr) {
                    console.warn("Standard fetch failed, trying no-cors...", corsErr);
                    res = await apiFetch(bulkUpdateUrl, {
                        method: 'POST',
                        mode: 'no-cors', // Fallback for some GAS deployments
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `action=bulkUpdateStatus&payload=${encodeURIComponent(JSON.stringify(payload))}`
                    });
                }

                // Check result if possible (no-cors implies opaque response, assume success if no error thrown)
                if (res && res.type !== 'opaque') {
                    let json;
                    if (res.ok) json = await res.json();
                    if (!res.ok || (json && json.status !== 'success')) {
                        throw new Error((json && json.data) ? json.data : `HTTP ${res.status}`);
                    }
                }

                // Success
                console.log("Background update success");
                toast.fire({
                    icon: 'success',
                    title: 'บันทึกข้อมูลเสร็จสิ้นเรียบร้อย'
                });

            } catch (err) {
                console.error('Update failed:', err);

                let verifiedUpdates = [];
                try {
                    verifiedUpdates = await verifyTodayStatusUpdates(payload);
                } catch (verifyErr) {
                    console.warn('Could not verify saved status updates:', verifyErr);
                }

                const verifiedCount = verifiedUpdates.filter(Boolean).length;
                if (verifiedCount === payload.length) {
                    toast.fire({
                        icon: 'success',
                        title: 'บันทึกข้อมูลเสร็จสิ้นเรียบร้อย'
                    });
                    return;
                }

                // Keep confirmed updates and roll back only rows not found in the sheet.
                pendingRows.forEach((row, index) => {
                    if (verifiedUpdates[index]) return;

                    const oldStatus = originalStatusMap.get(row.row_id);
                    if (oldStatus) {
                        row.status = oldStatus;
                        if (row.Status) row.Status = oldStatus;
                    }
                });
                updateTableToday();

                Swal.fire({
                    icon: verifiedCount > 0 ? 'warning' : 'error',
                    title: verifiedCount > 0 ? 'บันทึกบางรายการไม่สำเร็จ' : 'บันทึกไม่สำเร็จ',
                    text: verifiedCount > 0
                        ? `ยืนยันการบันทึกแล้ว ${verifiedCount} จาก ${payload.length} รายการ กรุณาตรวจสอบรายการที่เหลือ`
                        : 'เกิดข้อผิดพลาดในการส่งข้อมูล กรุณาลองใหม่',
                    footer: `<small>${err.message}</small>`
                });
            }
        })();
    });
}

// Pagination
function changePageToday(page) {
    state.currentPageToday = page;
    updateTableToday();
}

// Toggle "Show All" vs "Show Only Pending"
function setTodayMode(isPending, { reload = true } = {}) {
    state.showOnlyPending = isPending;
    const btn = document.getElementById('toggleAllDataBtn');

    if (btn) {
        if (state.showOnlyPending) {
            btn.innerHTML = '<i class="fas fa-clock"></i> <span>ทั้งหมด</span>';
            btn.title = "กำลังแสดงรายการตั้งแต่ 14:50 เมื่อวานถึงปัจจุบัน";
        } else {
            btn.innerHTML = '<i class="fas fa-history"></i> <span>รอเบิก</span>';
            btn.title = "คลิกเพื่อดูรายการล่าสุด และรายการค้างทั้งหมด";
        }
    }
    state.currentPageToday = 1;

    if (reload) {
        updateTableToday();
    } else {
        updateTableToday();
    }
}

// --- Sticker Preview Logic ---
function showStickerPreview(data) {
    const modal = document.getElementById('stickerPreviewModal');
    const container = document.getElementById('sticker-printable-area');
    if (!modal || !container) return;

    // Generate QR Code URL using Google Charts API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(data.material)}`;

    const html = `
        <div class="sticker-container" style="margin-top: 5px;">
            <div class="sticker-header">
                <div class="title">PARTS REQUISITION</div>
            </div>

            <div class="sticker-section" style="border-bottom: 1.5px solid #000; padding: 1mm 0;">
                <div class="sticker-field">
                    <span class="sticker-label">วันเวลา (DATE/TIME)</span>
                    <div class="sticker-value" style="font-size: 13px;">${data.timestamp}</div>
                </div>
            </div>
            
            <div class="sticker-section">
                <div class="sticker-row" style="align-items: center;">
                    <div class="sticker-col" style="flex: 1.5;">
                        <span class="sticker-label">MATERIAL CODE</span>
                        <div class="sticker-value huge" style="font-size: 28px;">${data.material}</div>
                    </div>
                    <div class="sticker-col" style="flex: 1; text-align: right;">
                        <img src="${qrUrl}" class="sticker-qr" style="width: 15mm; height: 15mm; margin: 0;" alt="QR Code">
                    </div>
                </div>
                <div class="sticker-field">
                    <span class="sticker-label">DESCRIPTION</span>
                    <div class="sticker-value" style="font-size: 14px;">${data.description}</div>
                </div>
            </div>

            <div class="sticker-section">
                <div class="sticker-row">
                    <div class="sticker-col">
                        <span class="sticker-label">STORAGE BIN</span>
                        <div class="sticker-value" style="font-size: 20px; font-weight: 700;">${data.storageBin}</div>
                    </div>
                    <div class="sticker-col" style="text-align: right;">
                        <span class="sticker-label">QUANTITY</span>
                        <div class="sticker-value" style="font-size: 24px; font-weight: 800;">${data.quantity} PCS</div>
                    </div>
                </div>
            </div>

            <div class="sticker-section" style="border-bottom: none; padding-top: 1mm; flex-grow: 1;">
                <div class="sticker-row" style="align-items: flex-start;">
                    <div class="sticker-col" style="flex: 1.8;">
                        <span class="sticker-label">TECHNICIAN / DEPT</span>
                        <div class="sticker-value" style="font-size: 15px; font-weight: 700; color: #000;">${data.employee}</div>
                        <div class="sticker-value" style="font-size: 13px; color: #333;">${data.team}</div>
                    </div>
                    <div class="sticker-col" style="flex: 1; text-align: right;">
                        <span class="sticker-label">CALL / TYPE</span>
                        <div class="sticker-value" style="font-size: 16px; font-weight: 800; color: #000;">${data.call} (${data.callType})</div>
                    </div>
                </div>
                ${(() => {
                    const cleanRemark = (data.remark || "").replace(/express/gi, "").trim();
                    if (!cleanRemark) return "";
                    return `
                    <div class="sticker-field" style="margin-top: 1mm; border-top: 1px dashed #ccc; padding-top: 1mm;">
                        <span class="sticker-label">REMARK</span>
                        <div class="sticker-value" style="color: red; font-size: 12px; font-weight: 700;">${cleanRemark}</div>
                    </div>`;
                })()}
            </div>

            </div>
        </div>
    `;

    container.innerHTML = html;
    modal.style.display = 'block';
}

// Bind Filter Buttons (and Pagination)
export function initTodayListeners() {
    console.log("Initializing Today Listeners...");

    const toggleBtn = document.getElementById('toggleAllDataBtn');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            setTodayMode(!state.showOnlyPending, { reload: false });
        };
        // Initialize state UI
        setTodayMode(true, { reload: false });
    }

    // Search Listener
    const searchInput = document.getElementById("searchInputToday");
    if (searchInput) {
        console.log("Today Search Input Found. Binding listener.");
        searchInput.addEventListener('input', () => {
            state.currentPageToday = 1;
            updateTableToday();
        });
    } else {
        console.warn("Today Search Input NOT Found during init.");
    }

    // Pagination Listeners Today
    const prev = document.getElementById("prevPageToday");
    const next = document.getElementById("nextPageToday");
    const first = document.getElementById("firstPageToday");
    const last = document.getElementById("lastPageToday");

    if (prev) prev.onclick = () => changePageToday(state.currentPageToday - 1);
    if (next) next.onclick = () => changePageToday(state.currentPageToday + 1);
    if (first) first.onclick = () => changePageToday(1);
    if (last) last.onclick = () => {
        const total = Math.ceil(state.currentFilteredDataToday.length / 20);
        changePageToday(total);
    };
    // Auto-refresh on visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            if (isLoggedIn) {
                console.log("Tab becomes visible, refreshing Today data...");
                loadTodayData({ silent: true });
            }
        }
    });
}
