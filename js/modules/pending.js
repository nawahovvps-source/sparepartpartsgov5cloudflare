import { apiFetch } from '../api.js';
import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { hideLoading, showDetailModal, renderPagination } from '../ui.js';
import { parseSafeFloat } from '../utils.js';
import { loadData } from './parts.js?v=39';
import { getBorrowTotal, loadBorrowData, showBorrowPopup } from '../loans.js';

let pendingAvailabilityFilter = 'available';

// Helper for Pending Tab Date Formatting
function formatDateTimePending(dateTime) {
    if (!dateTime) return "";
    const datePart = String(dateTime).split(" ")[0];
    return datePart;
}

function normalizePlantCode(code) {
    if (!code) return "";
    const cleaned = code.toString().trim().replace(/\.0$/, "");
    if (cleaned.length < 4 && /^\d+$/.test(cleaned)) {
        return cleaned.padStart(4, '0');
    }
    return cleaned;
}

// Global filter logic for Pending rows
function isValidPendingRow(row) {
    const pendingDept = String(row["ค้างหน่วยงาน"] || "").toLowerCase();
    return !pendingDept.includes("stock วิภาวดี 62") &&
        !pendingDept.includes("nec_ยกเลิกผลิต");
}

export async function loadPendingCallsData() {
    const loading = document.getElementById("loading");
    const syncIcon = document.getElementById("backgroundSyncIcon");
    // Helper to fetch and update
    const performUpdate = async () => {
        if (syncIcon) syncIcon.style.display = 'inline-block';
        try {
            console.log('Fetching fresh pending calls data...');
            const pendingUrl = `${CONFIG.ENDPOINTS.PENDING_CALLS}?v=${Date.now()}`;
            const res = await apiFetch(pendingUrl, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed');
            const freshData = await res.json();

            // Update State & Render
            state.allPendingData = freshData;
            filterAndRenderTablePending();

            // Trigger the background stock data load
            loadData({ render: false }).catch(e => console.warn("Background parts load failed", e));
            loadBorrowData()
                .then(() => filterAndRenderTablePending())
                .catch(e => console.warn("Background borrow data load failed", e));

            return freshData;
        } catch (e) {
            console.error("Failed to update pending calls:", e);
        } finally {
            if (loading) loading.style.display = "none";
            if (syncIcon) syncIcon.style.display = "none";
        }
    };

    if (loading) loading.style.display = "flex";
    await performUpdate();
}

export function filterAndRenderTablePending() {
    const tbody = document.querySelector("#data-table-pending tbody");
    if (!tbody) return;

    const userAuth = localStorage.getItem('userAuth') || 'None';
    const userPlant = (localStorage.getItem('userPlant') || '').toString().trim();
    const userTeam = (localStorage.getItem('userTeam') || '').toString().trim();
    const isAdmin = userAuth === 'Admin';

    console.log('Call Filter Debug - Start', { userAuth, userPlant, userTeam, isAdmin });

    // 1. First Pass: Filter by Search, Validity, and User Plant (Global Filters)
    let contextData = state.allPendingData.filter(row => {
        const valid = isValidPendingRow(row);
        if (!valid) return false;

        if (userPlant) {
            const normalizedRowPlant = normalizePlantCode(row["Plant"]);
            const normalizedUserPlant = normalizePlantCode(userPlant);
            if (normalizedRowPlant !== normalizedUserPlant) return false;

            if (!isAdmin && userTeam) {
                const rowTeam = String(row["Team"] || '').trim();
                if (rowTeam !== userTeam) return false;
            }
        } else if (!isAdmin && userTeam) {
            const rowTeam = String(row["Team"] || '').trim();
            if (rowTeam !== userTeam) return false;
        }

        // Search Logic
        const searchInput = document.getElementById("searchInputPending");
        const k = searchInput ? searchInput.value.trim().toLowerCase() : "";

        if (k) {
            return Object.values(row).some(v => String(v).toLowerCase().includes(k));
        }
        return true;
    });

    console.log('Call Filter Debug - End. Total Context Data:', contextData.length);

    const filtered = contextData.filter(row => {
        const remaining = parseSafeFloat(row["Unrestricted"]);
        return pendingAvailabilityFilter === 'available'
            ? remaining > 0
            : remaining <= 0;
    });

    // 4. Update State & Sorting/Grouping
    state.filteredPendingData = filtered;

    // Sort or Group Logic specific to Pending Tab
    // main.js groups by Ticket Number for color mapping
    const ticketGroups = {};
    filtered.forEach(row => {
        const ticket = row["Ticket Number"];
        if (!ticketGroups[ticket]) {
            ticketGroups[ticket] = [];
        }
        ticketGroups[ticket].push(row);
    });

    // Determine colors
    const uniqueTickets = Object.keys(ticketGroups).sort();
    const colorMap = {};
    uniqueTickets.forEach((ticket, index) => {
        if (ticket === "24103102058") {
            colorMap[ticket] = "pending-yellow-light"; // CSS class needed
        } else if (ticket === "25011101274") {
            colorMap[ticket] = "pending-pink-pastel"; // CSS class needed
        } else {
            colorMap[ticket] = index % 2 === 0 ? "pending-yellow-light" : "pending-pink-pastel";
        }
    });

    // Pagination Logic
    const itemsPerPage = 20;
    const start = (state.currentPagePending - 1) * itemsPerPage;
    const slice = filtered.slice(start, start + itemsPerPage);

    tbody.innerHTML = '';

    if (slice.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
        return;
    }

    // Render loop
    slice.forEach((row, i) => {
        const tr = document.createElement("tr");
        const ticket = row["Ticket Number"];

        // Apply color class
        tr.className = colorMap[ticket] || "";

        // Strict Columns from main.js
        const columns = ["Create Date", "Ticket Number", "Team", "Store Name", "TeamPlant", "Plant", "ค้างหน่วยงาน", "Material", "Description", "Unrestricted", "ค้างยืม"];

        columns.forEach(col => {
            const td = document.createElement("td");
            let cellValue = row[col] || "";

            if (col === "Create Date") {
                cellValue = formatDateTimePending(cellValue);
            }
            else if (col === "Unrestricted") {
                const numValue = parseSafeFloat(cellValue);
                cellValue = isNaN(numValue) ? "" : numValue.toString();
                td.style.textAlign = "center"; // main.js uses class pending-text-center
            }
            else if (col === "ค้างยืม") {
                const { borrowDataLoaded, borrowDataError } = state;
                const total = getBorrowTotal(row.Material);
                td.style.textAlign = "center";
                if (total > 0) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.className = "borrow-total-button";
                    button.textContent = total.toLocaleString("en-US");
                    button.title = "คลิกเพื่อดูรายการค้างยืม";
                    button.onclick = event => {
                        event.stopPropagation();
                        showBorrowPopup(row.Material);
                    };
                    td.appendChild(button);
                } else if (borrowDataLoaded) {
                    td.innerHTML = '<span class="stock-zero-chip">0</span>';
                } else if (borrowDataError) {
                    td.textContent = "!";
                    td.title = "โหลดข้อมูลค้างยืมไม่สำเร็จ";
                } else {
                    td.textContent = "...";
                }
                tr.appendChild(td);
                return;
            }

            if (col === "Description") {
                td.style.textAlign = "left"; // pending-text-left
            }

            if ((col === "Material" || col === "Description") && row["Description"] === "Code ผิด") {
                td.style.color = "red"; // pending-highlight-red
                td.style.fontWeight = "bold";
            }

            td.textContent = cellValue;
            tr.appendChild(td);
        });

        // Detail Button
        const detailTd = document.createElement("td");
        const btn = document.createElement("button");
        btn.textContent = "ดูรายละเอียด";
        btn.className = "detail-button"; // pending-detail-button
        btn.onclick = () => {
            // Show Modal logic
            const modal = document.getElementById('detailModalPending'); // Assuming ID exists in index.html or we reuse generic
            const content = document.getElementById('modalContentPending');

            if (modal && content) {
                const html = columns.map(col => {
                    let val = row[col] || "";
                    if (col === "Create Date") val = formatDateTimePending(val);
                    if (col === "Material" || col === "Description") {
                        if (row["Description"] === "Code ผิด") val = `<span style='color:red;font-weight:bold'>${val}</span>`;
                    }
                    return `<div><span class='label'>${col}:</span> <span class='value'>${val}</span></div>`;
                }).join('');
                content.innerHTML = html;
                modal.style.display = "block";
            }
        };
        detailTd.appendChild(btn);
        tr.appendChild(detailTd);

        tbody.appendChild(tr);
    });

    // Pagination controls rendering (Simple stub)
    const pageContainer = document.getElementById("pageNumbersPending");
    if (pageContainer) {
        pageContainer.innerHTML = `<button class="active">${state.currentPagePending}</button>`;
    }

    // Update Call Count
    const countVal = document.getElementById('callCountValuePending');
    if (countVal) {
        countVal.textContent = filtered.length;
    }
}

// Pagination helper
function changePagePending(page) {
    state.currentPagePending = page;
    filterAndRenderTablePending();
}

// Initialize Listeners
export function initPendingListeners() {
    console.log("Initializing Pending Listeners...");

    const availableButton = document.getElementById("pendingAvailableButton");
    const waitingButton = document.getElementById("pendingWaitingButton");

    const setAvailabilityFilter = (filter) => {
        pendingAvailabilityFilter = filter;
        if (availableButton) availableButton.classList.toggle("active", filter === "available");
        if (waitingButton) waitingButton.classList.toggle("active", filter === "waiting");
        state.currentPagePending = 1;
        filterAndRenderTablePending();
    };

    if (availableButton) {
        availableButton.addEventListener("click", () => {
            state.currentPagePending = 1;
            setAvailabilityFilter('available');
        });
    }
    if (waitingButton) {
        waitingButton.addEventListener("click", () => {
            state.currentPagePending = 1;
            setAvailabilityFilter('waiting');
        });
    }

    const searchInput = document.getElementById("searchInputPending");
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            state.currentPagePending = 1;
            filterAndRenderTablePending();
        });
    }

    const searchButton = document.getElementById("searchButtonPending");
    if (searchButton) {
        searchButton.addEventListener("click", () => {
            state.currentPagePending = 1;
            filterAndRenderTablePending();
        });
    }

    // Pagination
    const prev = document.getElementById("prevPagePending");
    const next = document.getElementById("nextPagePending");
    const first = document.getElementById("firstPagePending");
    const last = document.getElementById("lastPagePending");

    if (prev) prev.onclick = () => changePagePending(state.currentPagePending - 1);
    if (next) next.onclick = () => changePagePending(state.currentPagePending + 1);
    if (first) first.onclick = () => changePagePending(1);
    if (last) last.onclick = () => {
        const total = Math.ceil((state.filteredPendingData ? state.filteredPendingData.length : 0) / 20); // rough estimate logic update needed if real pagination
        changePagePending(total);
    };
}
