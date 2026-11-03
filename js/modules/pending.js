import { apiFetch } from '../api.js';
import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { hideLoading, showDetailModal, renderPagination } from '../ui.js';
import { parseSafeFloat } from '../utils.js';
import { loadData } from './parts.js?v=39';

// Helper for Pending Tab Date Formatting
function formatDateTimePending(dateTime) {
    if (!dateTime) return "";
    const datePart = dateTime.split(" ")[0];
    return datePart;
}

const PLANT_MAPPING = {
    "Stock กทม": "0301",
    "Stock คลังระยอง": "0369",
    "Stock วิภาวดี 62": "0326",
    "Stock ขอนแก่น": "0319",
    "Stock โคราช": "0309",
    "Stock เชียงใหม่": "0366",
    "Stock พระราม 3": "0304",
    "Stock พิษณุโลก": "0312",
    "Stock ภูเก็ต": "0313",
    "Stock ราชบุรี": "0305",
    "Stock ลำปาง": "0320",
    "Stock ศรีราชา": "0311",
    "Stock สุราษฎร์": "0307",
    "Stock ประเวศ": "0330"
};

function getPlantByTeamPlant(teamPlant) {
    if (!teamPlant) return "";
    const cleaned = teamPlant.toString().trim();
    const mapped = PLANT_MAPPING[cleaned] || "";
    // Normalize to 4 digits if it's a number-like string (e.g. 326 -> 0326)
    if (mapped && mapped.length < 4 && /^\d+$/.test(mapped)) {
        return mapped.padStart(4, '0');
    }
    return mapped;
}

function normalizePlantCode(code) {
    if (!code) return "";
    const cleaned = code.toString().trim();
    if (cleaned.length < 4 && /^\d+$/.test(cleaned)) {
        return cleaned.padStart(4, '0');
    }
    return cleaned;
}

// Global filter logic for Pending rows
function isValidPendingRow(row) {
    const pendingDept = (row["ค้างหน่วยงาน"] || "").toLowerCase();
    // Logic must match what is desired: Vipa > 0 AND not ignored depts
    return parseSafeFloat(row["Vipa"]) > 0 &&
        !pendingDept.includes("stock วิภาวดี 62") &&
        !pendingDept.includes("nec_ยกเลิกผลิต");
}

export async function loadPendingCallsData() {
    const loading = document.getElementById("loading");
    const syncIcon = document.getElementById("backgroundSyncIcon");
    const LOCAL_STORAGE_KEY = 'local_pending_calls_data';

    // Helper to fetch and update
    const performUpdate = async () => {
        if (syncIcon) syncIcon.style.display = 'inline-block';
        try {
            console.log('Fetching fresh pending calls data...');
            const res = await apiFetch(CONFIG.ENDPOINTS.PENDING_CALLS, { cache: 'no-store' });
            if (!res.ok) throw new Error('Failed');
            const freshData = await res.json();

            // Save to LocalStorage
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(freshData));
            } catch (storageErr) {
                console.warn('LocalStorage quota exceeded for pending calls:', storageErr);
            }

            // Update State & Render
            state.allPendingData = freshData;
            state.allPendingData = freshData;
            state.allPendingData = freshData;
            filterAndRenderTablePending();

            // Trigger Parts Load for Vipa Stock
            loadData({ render: false }).catch(e => console.warn("Background parts load failed", e));

            return freshData;
        } catch (e) {
            console.error("Failed to update pending calls:", e);
        } finally {
            if (loading) loading.style.display = "none";
            if (syncIcon) syncIcon.style.display = "none";
        }
    };

    const localDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);

    // 1. Check LocalStorage (Stale-While-Revalidate)
    if (localDataStr) {
        try {
            const parsedData = JSON.parse(localDataStr);
            if (Array.isArray(parsedData) && parsedData.length > 0) {
                console.log('Found pending calls in localStorage, rendering immediately...');
                state.allPendingData = parsedData;
                filterAndRenderTablePending();

                if (loading) loading.style.display = "none"; // Hide main loader immediately

                if (loading) loading.style.display = "none"; // Hide main loader immediately

                // Trigger Background Update
                performUpdate().catch(err => console.error("Background update failed", err));
                return; // Return immediately

                // Trigger Background Update
                performUpdate().catch(err => console.error("Background update failed", err));
                return; // Return immediately
            }
        } catch (err) {
            console.warn('Error parsing pending calls localStorage:', err);
        }
    }

    // 2. If no cache, show full loader and await fetch
    if (loading) loading.style.display = "flex";
    await performUpdate();
}

export function filterAndRenderTablePending() {
    const tbody = document.querySelector("#data-table-pending tbody");
    if (!tbody) return;

    const userAuth = localStorage.getItem('userAuth') || 'None';
    const userPlant = (localStorage.getItem('userPlant') || '').toString().trim();
    const isAdmin = userAuth === 'Admin';

    console.log('Call Filter Debug - Start', { userAuth, userPlant, isAdmin });

    // 1. First Pass: Filter by Search, Validity, and User Plant (Global Filters)
    let contextData = state.allPendingData.filter((row, idx) => {
        const valid = isValidPendingRow(row);
        if (!valid) return false;

        // User Plant Filter - Applies to everyone if they have a plant assigned
        if (userPlant) {
            const rawRowPlantVal = row["TeamPlant"];
            const rowPlantMapped = getPlantByTeamPlant(rawRowPlantVal);
            const normalizedRowPlant = normalizePlantCode(rowPlantMapped);
            const normalizedUserPlant = normalizePlantCode(userPlant);
            
            const matches = normalizedRowPlant === normalizedUserPlant;
            
            if (idx < 5) { // Log first 5 rows to see what's happening
                console.log(`Row #${idx} | Raw: "${rawRowPlantVal}" | Mapped: "${rowPlantMapped}" | Norm: "${normalizedRowPlant}" | UserPlant: "${normalizedUserPlant}" | Match: ${matches}`);
            }
            
            if (!matches) return false;
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

    // 2. Update Faceted Filter (Team) based on Context
    populateTeamFilter(contextData);

    // 3. Second Pass: Filter by Selected Team
    const teamFilter = document.getElementById("teamFilterPending");
    const selectedTeam = teamFilter ? teamFilter.value : "";

    let filtered = contextData.filter(row => {
        if (selectedTeam === "") return true;
        const rowTeam = (row["Team"] || "").toString().trim();
        return rowTeam === selectedTeam;
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
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center">ไม่พบข้อมูลที่ตรงกับเงื่อนไข</td></tr>';
        return;
    }

    // Render loop
    slice.forEach((row, i) => {
        const tr = document.createElement("tr");
        const ticket = row["Ticket Number"];

        // Apply color class
        tr.className = colorMap[ticket] || "";

        // Strict Columns from main.js
        const columns = ["DateTime", "Ticket Number", "Team", "Brand", "TeamPlant", "Plant", "ค้างหน่วยงาน", "Material", "Description", "Vipa", "DayRepair"];

        columns.forEach(col => {
            const td = document.createElement("td");
            let cellValue = row[col] || "";

            // Calculate Plant value dynamically
            if (col === "Plant") {
                cellValue = getPlantByTeamPlant(row["TeamPlant"]);
            }

            if (col === "DateTime") {
                cellValue = formatDateTimePending(cellValue);
            }
            else if (col === "DayRepair" || col === "Vipa") {
                const numValue = parseSafeFloat(cellValue);
                cellValue = isNaN(numValue) ? "" : numValue.toString(); // No commas in main.js for these? Or maybe yes? main.js said toString().
                td.style.textAlign = "center"; // main.js uses class pending-text-center
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
                    if (col === "DateTime") val = formatDateTimePending(val);
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

// Populate Team Filter Dropdown (Faceted)
function populateTeamFilter(data) {
    const teamSelect = document.getElementById("teamFilterPending");
    if (!teamSelect) return;

    // Data passed here is already filtered by Validity & Search
    if (!data) data = [];

    // Get unique teams
    const teams = new Set();
    data.forEach(row => {
        const team = (row["Team"] || "").toString().trim();
        if (team) teams.add(team);
    });

    const sortedTeams = Array.from(teams).sort();

    // Check current selection to preserve it if possible
    const currentVal = teamSelect.value;

    // Reset options
    teamSelect.innerHTML = '<option value="">ทั้งหมด</option>';

    sortedTeams.forEach(team => {
        const option = document.createElement("option");
        option.value = team;
        option.textContent = team;
        teamSelect.appendChild(option);
    });

    // Restore selection if valid, otherwise it defaults to "" (ทั้งหมด)
    if (currentVal && teams.has(currentVal)) {
        teamSelect.value = currentVal;
    } else if (currentVal && !teams.has(currentVal)) {
        // If selected team is no longer available in the filtered context, 
        // we essentially "reset" the filter visually by falling back to "All".
        // This is standard faceted search behavior.
        teamSelect.value = "";
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

    const teamFilter = document.getElementById("teamFilterPending");
    if (teamFilter) {
        teamFilter.addEventListener("change", () => {
            state.currentPagePending = 1;
            filterAndRenderTablePending();
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
