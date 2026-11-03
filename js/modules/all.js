import { apiFetch } from '../api.js';
import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { hideLoading } from '../ui.js';

export async function loadAllData() {
    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "flex";

    try {
        const res = await apiFetch(`${CONFIG.ENDPOINTS.GAS}?action=getRequests`);
        const json = await res.json();
        if (json.status === 'success') {
            state.allDataAll = json.data;
            renderTableAll();
        }
    } catch (e) {
        console.error(e);
    } finally {
        hideLoading();
    }
}

export function renderTableAll() {
    const tbody = document.querySelector("#data-table-all tbody");
    if (!tbody) return;

    const filtered = state.allDataAll; // apply filters if needed

    const itemsPerPage = 20;
    const start = (state.currentPageAll - 1 || 0) * itemsPerPage;
    const slice = filtered.slice(start, start + itemsPerPage);

    tbody.innerHTML = '';
    slice.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.status || ''}</td>
            <td>${row.timestamp || ''}</td>
            <td>${row.material || ''}</td>
            <td>${row.description || ''}</td>
            <td>${row.quantity || ''}</td>
            <td>${row.employeeName || ''}</td>
            <td>${row.team || ''}</td>
            <td>${row.callNumber || ''}</td>
            <td>${row.remark || ''}</td>
            <td><button class="detail-btn">Detail</button></td>
        `;
        tbody.appendChild(tr);
    });
}
