import { apiFetch, logUserAction } from '../api.js';
import { getCachedData } from '../cache.js';
import { state } from '../state.js';
import { CONFIG } from '../config.js';
import { hideLoading, showDetailModal, closeAllImageModals, renderPagination } from '../ui.js';
import { getStorageBinValue, extractIdFromUrlWeb, parseSafeFloat } from '../utils.js';
import { checkAuthForRequisition, loadEmployeeData } from '../auth.js';
import { getBorrowTotal, loadBorrowData, showBorrowPopup } from '../loans.js';



// Backward compatibility for cached files that might still request loadPartsData
export { loadData as loadPartsData };

export async function loadData(options = {}) {
    // Default options
    const { render = true } = options;

    const syncIcon = document.getElementById('backgroundSyncIcon');
    const previousPlant = localStorage.getItem('loaded_stock_plant');
    const plantCode = (localStorage.getItem('userPlant') || '').trim().replace(/\.0$/, '');
    const normalizedPlant = /^\d+$/.test(plantCode) ? plantCode.padStart(4, '0') : plantCode;
    const LOCAL_STORAGE_KEY = `local_parts_data_${normalizedPlant || 'default'}`;
    const plantChanged = previousPlant !== null && previousPlant !== normalizedPlant;
    if (plantChanged) {
        state.partsDataLoaded = false;
    }

    loadBorrowData().then(() => {
        if (state.partsDataLoaded) renderTableData();
    }).catch(error => console.error('Failed to load borrow stock:', error));

    // Helper to fetch and update
    const performUpdate = async () => {
        if (syncIcon) syncIcon.style.display = 'inline-block';
        try {
            console.log('Fetching fresh data from API (Main + Stocks)...');

            // Parallel Fetch
            const [mainRes, vibhaRes, nawaRes] = await Promise.all([
                apiFetch(CONFIG.ENDPOINTS.MAIN_SAP, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                }),
                apiFetch(`${CONFIG.ENDPOINTS.STOCK}?location=vibhavadi`),
                apiFetch(`${CONFIG.ENDPOINTS.STOCK}?location=nawanakorn`)
            ]);

            if (!mainRes.ok) throw new Error('Main Data load failed');

            const mainData = await mainRes.json();
            const vibhaData = vibhaRes.ok ? await vibhaRes.json() : [];
            const nawaData = nawaRes.ok ? await nawaRes.json() : [];

            console.log(`Loaded: Main(${mainData.length}), Vibha(${vibhaData.length}), Nawa(${nawaData.length})`);

            // Merge Logic
            // Create Maps for fast lookup
            const vibhaMap = new Map();
            vibhaData.forEach(item => {
                const mat = (item.Material || "").toString().trim();
                if (mat) {
                    vibhaMap.set(mat, {
                        stock: item.Unrestricted || item["คงเหลือ"] || item["วิภาวดี"] || "0",
                        storageBin: item["Storage bin"] || item["Storage Bin"] || item["storage bin"] || ""
                    });
                }
            });

            const nawaMap = new Map();
            nawaData.forEach(item => {
                const mat = (item.Material || "").toString().trim();
                if (mat) nawaMap.set(mat, item.Unrestricted || "0");
            });

            // Override Main Data
            const mergedData = mainData.map(row => {
                const mat = (row.Material || "").toString().trim();

                // Override Vibhavadi
                if (vibhaMap.has(mat)) {
                    const vibhaStock = vibhaMap.get(mat);
                    row['วิภาวดี'] = vibhaStock.stock;
                    row['Storage bin'] = vibhaStock.storageBin;
                } else {
                    row['Storage bin'] = "";
                }

                // Override Nawanakorn (Unrestricted column)
                if (nawaMap.has(mat)) {
                    row['Unrestricted'] = nawaMap.get(mat);
                    row['นวนคร'] = nawaMap.get(mat); // Ensure consistency if 'นวนคร' key exists
                }

                return row;
            });

            try {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(mergedData));
                localStorage.setItem('loaded_stock_plant', normalizedPlant);
            } catch (storageErr) {
                console.warn('LocalStorage quota exceeded or error:', storageErr);
            }

            // Render conditionally
            if (render) {
                processAndRenderData(mergedData);
                state.partsDataLoaded = true;
            } else {
                // Determine search string but don't render UI
                state.allData = mergedData.map(row => {
                    const searchStr = Object.values(row).join(' ').toLowerCase();
                    return { ...row, _searchString: searchStr };
                });
                state.tempFilteredData = state.allData;
                state.partsDataLoaded = true;
            }

            return mergedData;
        } catch (error) {
            console.error('Failed to update parts data:', error);
            // Only show error UI if we are in a mode that expects rendering or if we have no data at all
            if (render && (!state.allData || state.allData.length === 0)) {
                const errorContainer = document.getElementById("error-container");
                if (errorContainer) errorContainer.style.display = 'block';
            }
            throw error;
        } finally {
            if (syncIcon) syncIcon.style.display = 'none';
        }
    };

    const localDataStr = plantChanged ? null : localStorage.getItem(LOCAL_STORAGE_KEY);

    if (localDataStr) {
        try {
            const parsedData = JSON.parse(localDataStr);
            if (Array.isArray(parsedData) && parsedData.length > 0) {
                console.log('Found data in localStorage, rendering immediately...');

                if (render) {
                    processAndRenderData(parsedData);
                } else {
                    // Just load into state
                    state.allData = parsedData.map(row => {
                        const searchStr = Object.values(row).join(' ').toLowerCase();
                        return { ...row, _searchString: searchStr };
                    });
                    state.tempFilteredData = state.allData;
                }

                state.partsDataLoaded = true;

                // Trigger background update (Stale-While-Revalidate)
                performUpdate().catch(err => console.error("Background update failed", err));

                // Return immediately so app.js hides the big loader
                return parsedData;
            }
        } catch (err) {
            console.warn('Error parsing localStorage data:', err);
        }
    }

    // If no local data, we must await the fetch
    return await performUpdate();
}

function processAndRenderData(data) {
    // Pre-compute search string for performance
    state.allData = data.map(row => {
        // Combine all searchable values into one lowercase string
        const searchStr = Object.values(row).join(' ').toLowerCase();
        return { ...row, _searchString: searchStr };
    });
    state.tempFilteredData = state.allData;

    // Apply filters again to update UI
    applyFilters();
}

export function applyFilters() {
    const searchInput1 = document.getElementById("searchInput1");
    const searchInput2 = document.getElementById("searchInput2");

    if (!state.partsDataLoaded) return;

    const query1 = searchInput1 ? searchInput1.value.toLowerCase().trim() : '';
    const query2 = searchInput2 ? searchInput2.value.toLowerCase().trim() : '';

    state.currentFilteredData = state.allData.filter(row => {
        const searchStr = row._searchString || "";
        const match1 = !query1 || searchStr.includes(query1);
        const match2 = !query2 || searchStr.includes(query2);
        return match1 && match2;
    });

    state.currentPage = 1;

    renderTableData();

    // Fix: Pass all arguments to renderPagination
    const itemsPerPageSelect = document.getElementById("itemsPerPage");
    const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;
    renderPagination(state.currentFilteredData.length, state.currentPage, 'pageNumbers', itemsPerPage);
}

// Update renderTableData to match main.js renderTable EXACTLY
export function renderTableData() {
    const tableBody = document.querySelector("#data-table tbody");
    if (!tableBody) return;

    // Clear existing content
    tableBody.innerHTML = "";

    const itemsPerPageSelect = document.getElementById("itemsPerPage");
    const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;

    const start = (state.currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = state.currentFilteredData.slice(start, end);

    const fragment = document.createDocumentFragment();

    // Validating Auth logic from main.js
    const userAuth = localStorage.getItem('userAuth') || 'None';
    const savedUsername = localStorage.getItem('username');
    // main.js logic:
    const hasPermission = savedUsername === '7512411' || userAuth === '0326' || userAuth === 'Admin';

    pageData.forEach(row => {
        const tr = document.createElement("tr");

        // 1. Withdraw Button
        const tdReq = document.createElement("td");
        const btn = document.createElement("button");
        btn.textContent = "เบิก";
        if (hasPermission) {
            btn.className = "requisition-button";
            btn.onclick = (e) => {
                e.stopPropagation();
                showRequisitionDialog(row);
            };
        } else {
            btn.className = "requisition-button-disabled";
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.style.cursor = "not-allowed";
            btn.title = "ไม่มีสิทธิ์เบิกอะไหล่";
            btn.onclick = (e) => {
                e.stopPropagation();
                checkAuthForRequisition();
            };
        }
        tdReq.appendChild(btn);
        tr.appendChild(tdReq);

        // Columns definition from main.js
        const columns = [
            "ImageDb", "Material", "Description", "Storage bin", "วิภาวดี", "Unrestricted", "ค้างยืม",
            "Rebuilt", "หมายเหตุ", "Product", "OCRTAXT"
        ];

        // Pre-calculate styling conditions
        const vibhavadiValue = parseSafeFloat(row["วิภาวดี"]);
        const unrestrictedValue = parseSafeFloat(row["Unrestricted"]);
        let textColor = "";
        let fontWeight = "";
        if (vibhavadiValue > 0) {
            textColor = "#4caf50";
            fontWeight = "bold";
        } else if (vibhavadiValue === 0 && unrestrictedValue > 0) {
            textColor = "#2196f3";
            fontWeight = "bold";
        }

        columns.forEach(col => {
            const td = document.createElement("td");
            let value = col === "Storage bin" ? getStorageBinValue(row) : (row[col] || "");

            if (col === "ค้างยืม") {
                const total = getBorrowTotal(row.Material);
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
                } else {
                    if (state.borrowDataLoaded) {
                        td.innerHTML = '<span class="stock-zero-chip">0</span>';
                    } else if (state.borrowDataError) {
                        const retry = document.createElement("button");
                        retry.type = "button";
                        retry.className = "borrow-total-button borrow-error-button";
                        retry.textContent = "!";
                        retry.title = "โหลดข้อมูลค้างยืมไม่สำเร็จ คลิกเพื่อลองใหม่";
                        retry.onclick = event => {
                            event.stopPropagation();
                            loadBorrowData()
                                .then(() => renderTableData())
                                .catch(error => console.error("Failed to retry borrow data:", error));
                        };
                        td.appendChild(retry);
                    } else {
                        td.textContent = "…";
                    }
                }
                td.className = "borrow-total-cell";
                tr.appendChild(td);
                return;
            }

            // Number formatting
            if ((col === "วิภาวดี" || col === "Unrestricted") && value !== "") {
                const num = parseSafeFloat(value);
                if (!isNaN(num)) {
                    value = num.toLocaleString("en-US");
                }
            }

            // Red/Bold for specific columns
            if ((col === "หมายเหตุ" || col === "Rebuilt") && value) {
                td.style.color = "#d32f2f";
                td.style.fontWeight = "bold";
            }

            // Color logic for specific columns
            if (["Material", "Description", "Storage bin", "วิภาวดี", "Unrestricted"].includes(col)) {
                if (textColor) td.style.color = textColor;
                if (fontWeight) td.style.fontWeight = fontWeight;
            }

            // Zero chip logic
            if ((col === "วิภาวดี" || col === "Unrestricted") && value !== "") {
                const numericValue = parseSafeFloat(value);
                if (!isNaN(numericValue) && numericValue === 0) {
                    td.innerHTML = `<span class="stock-zero-chip">0</span>`;
                    tr.appendChild(td);
                    return; // Skip default textContent
                }
            }

            // ImageDb logic
            if (col === "ImageDb") {
                const fileIdDb = (() => {
                    const material = (row.Material || "").toString().trim();
                    if (state.imageDbLoaded && state.imageDatabase[material] && state.imageDatabase[material].length > 0) {
                        return state.imageDatabase[material][0];
                    }
                    return "";
                })();

                if (fileIdDb) {
                    const imgContainer = document.createElement("div");
                    imgContainer.style.cursor = "pointer";
                    imgContainer.title = "คลิกเพื่อดูรายละเอียด";

                    // Add click event specifically for the image
                    imgContainer.onclick = (e) => {
                        e.stopPropagation();
                        showDetailModal(row, 'imageModal', 'imageModalContent');
                    };

                    const img = document.createElement("img");
                    img.src = `https://drive.google.com/thumbnail?id=${fileIdDb}&sz=s100`;
                    img.referrerPolicy = "no-referrer";
                    img.alt = "รูป";
                    img.style.width = "40px";
                    img.style.height = "60px";
                    img.style.objectFit = "cover";
                    img.style.borderRadius = "6px";
                    img.loading = "lazy";
                    img.onerror = () => { img.src = 'https://via.placeholder.com/60/ccc/999?text=NOIMG'; };

                    imgContainer.appendChild(img);
                    td.appendChild(imgContainer);
                } else {
                    td.textContent = "-";
                }
                tr.appendChild(td);
                return;
            }

            td.textContent = value;
            tr.appendChild(td);
        });

        // Row click removed loop end
        fragment.appendChild(tr);
    });
    tableBody.appendChild(fragment);
}



export function changePage(page) {
    state.currentPage = page;
    renderTableData();
    const itemsPerPageSelect = document.getElementById("itemsPerPage");
    const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;
    renderPagination(state.currentFilteredData.length, state.currentPage, 'pageNumbers', itemsPerPage);
}

export async function loadImageDatabase() {
    // If already loaded in memory, rely on that (or force update if needed?)
    // Current logic: if loaded, skip. Ideally, we might want to check freshness, but let's stick to simple SWR for now.
    // If state.imageDbLoaded is true, we usually don't call this.
    // But if we want to ensure background updates even if loaded, we might need a separate check.
    // For now, let's keep "if loaded return" for in-memory, but add SWR for first load to avoid spinner.

    if (state.imageDbLoaded) return;

    const syncIcon = document.getElementById('backgroundSyncIcon');
    const LOCAL_STORAGE_KEY = 'local_image_db';

    // Helper to fetch and update
    const performUpdate = async () => {
        if (syncIcon) syncIcon.style.display = 'inline-block';
        try {
            console.log("Fetching fresh Image DB...");
            const res = await apiFetch(CONFIG.ENDPOINTS.IMAGES);
            if (!res.ok) throw new Error(`Load images failed: ${res.status}`);
            const data = await res.json();

            const db = {};
            data.forEach(item => {
                const mat = (item.Material || "").toString().trim();
                const id = (
                    item.idchack || item.Idchack || item.IDchack ||
                    item.idChack || item.IdChack || ""
                ).toString().trim();
                if (mat && id) {
                    if (!db[mat]) db[mat] = [];
                    db[mat].push(id);
                }
            });

            // Save to LocalStorage
            try {
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
            } catch (storageErr) {
                console.warn('LocalStorage quota exceeded for Image DB:', storageErr);
            }

            state.imageDatabase = db;
            state.imageDbLoaded = true;
            return db;
        } catch (e) {
            console.warn("Images DB load error", e);
        } finally {
            if (syncIcon) syncIcon.style.display = 'none';
        }
    };

    const localDataStr = localStorage.getItem(LOCAL_STORAGE_KEY);

    // 1. Check LocalStorage
    if (localDataStr) {
        try {
            const parsedDb = JSON.parse(localDataStr);
            if (Object.keys(parsedDb).length > 0) {
                console.log('Found Image DB in localStorage, using immediately...');
                state.imageDatabase = parsedDb;
                state.imageDbLoaded = true;

                // Trigger background update
                performUpdate().catch(err => console.error("Background Image DB update failed", err));

                return; // Return immediately
            }
        } catch (err) {
            console.warn('Error parsing Image DB localStorage:', err);
        }
    }

    // 2. If no cache, await fetch
    await performUpdate();
}

function saveToLocalStorage(key, value) {
    let items = JSON.parse(localStorage.getItem(key)) || [];
    if (!items.includes(value)) {
        items.unshift(value);
        if (items.length > 5) items.pop();
        localStorage.setItem(key, JSON.stringify(items));
    }
}

function getFromLocalStorage(key) {
    return JSON.parse(localStorage.getItem(key)) || [];
}

export async function showRequisitionDialog(row) {
    if (!checkAuthForRequisition()) return;

    document.body.style.overflow = 'hidden';
    const savedUsername = localStorage.getItem('username') || '';
    let selectedCallType = '';

    const history = {
        contact: getFromLocalStorage('contact'),
        callNumber: getFromLocalStorage('callNumber')
    };

    // Use exact HTML from main.js
    // Pre-Requisition Checks Logic from main.js
    const vibhavadiValue = parseSafeFloat(row["วิภาวดี"]);
    const unrestrictedValue = parseSafeFloat(row["Unrestricted"]);
    const remark = row["หมายเหตุ"] || '';
    const hasStockVibha = vibhavadiValue > 0;

    // 1. Check for Replacement (Unrestricted=0, Remark exists)
    if (unrestrictedValue === 0 && remark.trim() !== '') {
        const replacementWarning = await Swal.fire({
            title: '<strong style="font-size:24px; color:#f39c12;">คำเตือน!</strong>',
            iconColor: '#f39c12',
            width: window.innerWidth <= 480 ? '90%' : '560px',
            padding: '30px 20px',
            background: document.body.classList.contains('dark-mode') ? '#2d2d2d' : '#ffffff',
            backdrop: 'rgba(0,0,0,0.85)',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check"></i> ยืนยัน',
            cancelButtonText: '<i class="fas fa-times"></i> ยกเลิก',
            reverseButtons: true,
            buttonsStyling: false,
            html: `
        <div style="text-align:center; margin:20px 0;">
          <i class="fas fa-exclamation-triangle" style="font-size:60px; color:#f39c12; margin-bottom:15px; opacity:0.9;"></i>
          <div style="font-size:18px; font-weight:600; color:#e67e22;">
            ${row.Material || ''}
          </div>
          <div style="font-size:18px; font-weight:600; color:#e67e22; margin-top:10px;">
            ${row.Description || ''}
          </div>
          <div style="font-size:17px; color:#7f8c8d; margin:15px 0;">
            คลังนวนครไม่มีของเหลือแล้ว
          </div>
          <div style="
    margin-top:20px; 
    padding:18px 20px; 
    background:#f0fff4; 
    border:2px solid #2ecc71; 
    border-radius:14px; 
    font-size:17px; 
    color:#1e874b; 
    font-weight:bold;
    box-shadow:0 2px 6px rgba(0,0,0,0.05);
">
    <i class="fas fa-exclamation-circle" style="color:#2ecc71; margin-right:8px;"></i>
    อาจมีอะไหล่ทดแทน: 
    <span style="color:#0a0; font-size:18px;">${remark}</span>
</div>
          </div>
        </div>
      `,
            didOpen: () => {
                const confirmBtn = document.querySelector('.swal2-confirm');
                const cancelBtn = document.querySelector('.swal2-cancel');
                if (confirmBtn) confirmBtn.style.cssText = `background: linear-gradient(135deg, #e74c3c, #c0392b) !important; color: white !important; padding: 14px 36px !important; border-radius: 30px !important; font-size: 17px !important; font-weight: bold !important; box-shadow: 0 6px 20px rgba(231,76,60,0.5) !important;`;
                if (cancelBtn) cancelBtn.style.cssText = `background: linear-gradient(135deg, #95a5a6, #7f8c8d) !important; color: white !important; padding: 14px 36px !important; border-radius: 30px !important; font-size: 17px !important; font-weight: bold !important; box-shadow: 0 6px 20px rgba(127,140,141,0.5) !important;`;
            }
        });

        if (replacementWarning.isDismissed) {
            document.body.style.overflow = 'auto';
            return;
        }
    }

    // 2. Check for Vibhavadi Stock (Vibhavadi > 0)
    if (hasStockVibha) {
        const warningResult = await Swal.fire({
            title: '<strong style="font-size:24px; color:#f39c12;">คำเตือน!</strong>',
            iconColor: '#f39c12',
            width: window.innerWidth <= 480 ? '90%' : '560px',
            padding: '30px 20px',
            background: document.body.classList.contains('dark-mode') ? '#2d2d2d' : '#ffffff',
            backdrop: 'rgba(0,0,0,0.85)',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check"></i> ยืนยัน',
            cancelButtonText: '<i class="fas fa-times"></i> ยกเลิก',
            reverseButtons: true,
            buttonsStyling: false,
            html: `
        <div style="text-align:center; margin:20px 0;">
          <i class="fas fa-exclamation-triangle" style="font-size:60px; color:#f39c12; margin-bottom:15px; opacity:0.9;"></i>
          <div style="font-size:18px; font-weight:600; color:#e67e22;">
            คลังวิภาวดีมีของอยู่
          </div>
          <div style="font-size:32px; font-weight:bold; color:#27ae60; margin:12px 0;">
            ${vibhavadiValue.toLocaleString()} ชิ้น
          </div>
          <div style="font-size:17px; color:#7f8c8d; margin:15px 0;">
            กรุณาตรวจสอบว่าจำเป็นต้องเบิกจากนวนครจริงหรือไม่
          </div>
          <div style="
    margin-top:20px; 
    padding:16px; 
    background:#e8f5e8; 
    border-left:6px solid #27ae60; 
    border-radius:12px; 
    font-size:16px; 
    color:#1e874b;
    font-weight:bold;
    display:flex;
    align-items:center;
    gap:10px;
">
    <i class="fas fa-info-circle" style="font-size:20px;"></i>
    <span>หากยืนยัน ระบบจะดึงจากคลังนวนครแทน</span>
</div>
        </div>
      `,
            didOpen: () => {
                const confirmBtn = document.querySelector('.swal2-confirm');
                const cancelBtn = document.querySelector('.swal2-cancel');
                if (confirmBtn) confirmBtn.style.cssText = `background: linear-gradient(135deg, #e74c3c, #c0392b) !important; color: white !important; padding: 14px 36px !important; border-radius: 30px !important; font-size: 17px !important; font-weight: bold !important; box-shadow: 0 6px 20px rgba(231,76,60,0.5) !important;`;
                if (cancelBtn) cancelBtn.style.cssText = `background: linear-gradient(135deg, #95a5a6, #7f8c8d) !important; color: white !important; padding: 14px 36px !important; border-radius: 30px !important; font-size: 17px !important; font-weight: bold !important; box-shadow: 0 6px 20px rgba(127,140,141,0.5) !important;`;
            }
        });

        if (warningResult.isDismissed) {
            document.body.style.overflow = 'auto';
            return;
        }
    }

    const result = await Swal.fire({
        title: '📋 เบิกอะไหล่นวนคร',
        html: `
      <style>
        .custom-swal-popup { border-radius: 18px !important; padding: 18px 20px !important; }
        .swal2-title { font-size: 20px !important; margin-bottom: 8px !important; }
        .material-header { text-align: center; padding: 10px 12px; border-radius: 12px; background: linear-gradient(135deg, #e0f2ff, #f3e5ff); margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
        .material-code { font-size: 18px; font-weight: 700; }
        .material-desc { margin-top: 4px; font-size: 14px; }
        .swal2-label { text-align: left !important; display: block !important; margin: 6px 0 4px !important; font-weight: 600 !important; width: 100% !important; font-size: 13px !important; }
        .swal2-input, .swal2-select { width: 100% !important; margin: 4px 0 !important; padding: 8px 10px !important; font-size: 14px !important; height: 38px !important; border-radius: 8px !important; border: 1px solid #ddd !important; background-color: #fafafa !important; }
        .swal2-input:focus { border-color: #667eea !important; box-shadow: 0 0 0 2px rgba(102,126,234,0.2) !important; background-color: #ffffff !important; outline: none !important; }
        .error-message { color: red !important; font-size: 12px !important; margin-top: 2px !important; display: block !important; text-align: left !important; }
        .call-type-container { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0; justify-content: center; }
        .call-type-btn { padding: 8px 16px; border: none; border-radius: 25px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.3s ease; color: white; min-width: 60px; text-align: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1); background: linear-gradient(135deg, #e0e0e0, #f5f5f5); color: #666; }
        .call-type-btn.selected { background: linear-gradient(135deg, #667eea, #764ba2); box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3); color: white; transform: translateY(-1px); }
        .call-type-btn:hover:not(.selected) { background: linear-gradient(135deg, #d0d0d0, #e5e5e5); transform: translateY(-1px); }
      </style>

      <div class="material-header">
        <div class="material-code">${row.Material || ''}</div>
        <div class="material-desc">${row.Description || ''}</div>
      </div>

      <label class="swal2-label">🔢 จำนวน</label>
      <input id="swal-quantity" class="swal2-input" type="number" value="1" min="1">
      <span id="swal-quantity-error" class="error-message"></span>

      <label class="swal2-label">🆔 รหัสพนักงาน</label>
      <input id="swal-employee-code" class="swal2-input" value="${savedUsername}" readonly style="background:#f0f0f0; cursor:not-allowed">
      <span id="swal-employee-code-error" class="error-message"></span>

      <label class="swal2-label">📞 เบอร์ติดต่อ</label>
      <div style="position:relative;">
        <input id="swal-contact" class="swal2-input" placeholder="เช่น 08xxxxxxxx" list="contact-list">
        <datalist id="contact-list">
             ${history.contact.map(c => `<option value="${c}">`).join('')}
        </datalist>
      </div>
      <span id="swal-contact-error" class="error-message"></span>

      <label class="swal2-label">📄 เลขที่ Call</label>
      <div style="position:relative;">
        <input id="swal-call-number" class="swal2-input" placeholder="2... (11 หลัก)" list="call-list">
        <datalist id="call-list">
             ${history.callNumber.map(c => `<option value="${c}">`).join('')}
        </datalist>
      </div>
      <span id="swal-call-number-error" class="error-message"></span>

      <label class="swal2-label">🗳️ Call Type</label>
      <div id="call-type-container" class="call-type-container">
        <button class="call-type-btn" type="button" data-value="I">I</button>
        <button class="call-type-btn" type="button" data-value="P">P</button>
        <button class="call-type-btn" type="button" data-value="Q">Q</button>
        <button class="call-type-btn" type="button" data-value="R">R</button>
      </div>
      <span id="swal-call-type-error" class="error-message"></span>

      <label class="swal2-label">🗒️ หมายเหตุ</label>
      <input id="swal-remark" class="swal2-input" placeholder="ระบุเหตุผล (ถ้ามี)">
      <span id="swal-remark-error" class="error-message"></span>
    `,
        showCancelButton: true,
        confirmButtonText: '✅ ยืนยันเบิก',
        cancelButtonText: '❌ ยกเลิก',
        buttonsStyling: false,
        customClass: {
            popup: 'custom-swal-popup',
            confirmButton: 'swal2-confirm-btn', // Assumed global class
            cancelButton: 'swal2-cancel-btn'
        },
        focusConfirm: false,
        didOpen: () => {
            // Re-apply style to buttons (since we didn't inject all CSS in style block, we rely on inline or global)
            const confirmBtn = Swal.getConfirmButton();
            const cancelBtn = Swal.getCancelButton();
            if (confirmBtn) confirmBtn.style.cssText = `background: linear-gradient(135deg, #4caf50, #2e7d32); color: white; padding: 10px 24px; border-radius: 99px; border: none; font-weight: bold; margin-right: 8px;`;
            if (cancelBtn) cancelBtn.style.cssText = `background: #f5f5f5; color: #666; padding: 10px 24px; border-radius: 99px; border: 1px solid #ddd; font-weight: bold;`;

            const btns = document.querySelectorAll('.call-type-btn');
            btns.forEach(b => b.onclick = () => {
                btns.forEach(x => x.classList.remove('selected'));
                b.classList.add('selected');
                selectedCallType = b.dataset.value;
            });

            if (history.contact.length > 0) {
                document.getElementById('swal-contact').value = history.contact[0];
            }
        },
        preConfirm: () => {
            const quantity = document.getElementById('swal-quantity').value;
            const contact = document.getElementById('swal-contact').value;
            const callNumber = document.getElementById('swal-call-number').value;
            const remark = document.getElementById('swal-remark').value;

            // Robustly get valid call type from DOM
            const selectedBtn = document.querySelector('.call-type-btn.selected');
            const currentCallType = selectedBtn ? selectedBtn.dataset.value : '';

            let isValid = true;
            if (!quantity || quantity < 1) { document.getElementById('swal-quantity-error').textContent = 'ระบุจำนวน'; isValid = false; }
            if (!contact || contact.length < 9) { document.getElementById('swal-contact-error').textContent = 'ระบุเบอร์ติดต่อ'; isValid = false; }
            if (!remark.trim()) {
                if (!callNumber || !currentCallType) {
                    if (!callNumber) document.getElementById('swal-call-number-error').textContent = 'ระบุเลข Call';
                    if (!currentCallType) document.getElementById('swal-call-type-error').textContent = 'เลือก Call Type';
                    isValid = false;
                }
            }
            if (!isValid) return false;
            return { quantity, contact, callNumber, callType: currentCallType, remark, employeeCode: savedUsername };
        }
    });

    if (result.isConfirmed) {
        document.body.style.overflow = 'auto';
        await submitRequisition(row, result.value);
    } else {
        document.body.style.overflow = 'auto';
    }
}

async function submitRequisition(row, formValues) {
    const timestampStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', hour12: false }).replace(',', '');
    const user = (await loadEmployeeData()).find(e => e.IDRec == formValues.employeeCode);

    // 1. Construct Payload
    const payload = {
        material: row.Material || '',
        description: row.Description || '',
        quantity: parseInt(formValues.quantity, 10),
        contact: formValues.contact,
        employeeCode: formValues.employeeCode,
        team: user ? user.หน่วยงาน : '',
        employeeName: user ? user.Name : '',
        callNumber: formValues.callNumber || '',
        callType: formValues.callType || '',
        remark: formValues.remark || '',
        status: 'รอเบิก',
        vibhavadi: '0',
        plant: localStorage.getItem('userPlant') || '',
        timestamp: timestampStr
    };

    // Save history
    saveToLocalStorage('contact', formValues.contact);
    if (formValues.callNumber) saveToLocalStorage('callNumber', formValues.callNumber);

    // 2. Optimistic Update (Immediate UI Feedback)

    // Create a temporary ID for local state
    const tempId = 'temp_' + Date.now();
    const optimisticRow = {
        ...payload,
        row_id: tempId,
        IDRow: tempId,
        Material: payload.material,
        Description: payload.description,
        Quantity: payload.quantity,
        Timestamp: payload.timestamp,
        EmployeeName: payload.employeeName,
        Team: payload.team,
        CallNumber: payload.callNumber,
        CallType: payload.callType,
        Remark: payload.remark,
        Plant: payload.plant,
        Status: payload.status
    };

    // Push to local state if initialized, or initialize if empty
    if (!state.todayData) {
        state.todayData = [];
        state.todayDataLoaded = true; // Mark as loaded so we don't overwrite blindly on first switch
    }
    state.todayData.unshift(optimisticRow);

    // Trigger DOM Re-render
    if (window.updateTodayTableGlobal) {
        window.updateTodayTableGlobal();
    }

    // 3. User Feedback (Non-blocking Toast)
    // Close any previous swals immediately
    import('../ui.js').then(ui => ui.closeAllImageModals()); // Optional: maybe keep image open? User said "like AppSheet", implying "Done".

    const Toast = Swal.mixin({
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
    Toast.fire({
        icon: 'info',
        title: 'กำลังบันทึกข้อมูล...'
    });

    // 4. Background Sync
    (async () => {
        try {
            const res = await apiFetch(CONFIG.ENDPOINTS.GAS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `action=insertRequest&payload=${encodeURIComponent(JSON.stringify(payload))}`
            });

            if (res.ok) {
                // Success
                Toast.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ'
                });

                // Send log
                logUserAction('เบิกอะไหล่', `Material: ${payload.material} (${payload.quantity} ชิ้น), Call: ${payload.callNumber || '-'}, หมายเหตุ: ${payload.remark || '-'}`);

                // Navigate to Today tab immediately
                if (window.showTab) {
                    window.showTab('today');
                }
            } else {
                throw new Error('API Error');
            }
        } catch (e) {
            console.error(e);
            // Rollback Logic
            if (state.todayData) {
                state.todayData = state.todayData.filter(r => r.row_id !== tempId);
            }
            if (window.updateTodayTableGlobal) window.updateTodayTableGlobal();

            Swal.fire({
                icon: 'error',
                title: 'บันทึกไม่สำเร็จ',
                text: 'กรุณาลองใหม่อีกครั้ง'
            });
        }
    })();
}

// Sync Logic for Search Inputs (Parts <-> Images)
setTimeout(() => {
    const s1 = document.getElementById('searchInput1');
    const s2 = document.getElementById('searchInput2');

    // Initialize from state if available (e.g. coming back from Images tab)
    if (s1 && state.search1) s1.value = state.search1;
    if (s2 && state.search2) s2.value = state.search2;

    if (s1) {
        s1.addEventListener('input', (e) => {
            state.search1 = e.target.value;
            const imgS1 = document.getElementById('searchInputImages1');
            if (imgS1) imgS1.value = state.search1;
            applyFilters();
        });
    }

    if (s2) {
        s2.addEventListener('input', (e) => {
            state.search2 = e.target.value;
            const imgS2 = document.getElementById('searchInputImages2');
            if (imgS2) imgS2.value = state.search2;
            applyFilters();
        });
    }

    // Pagination Event Listeners
    const prev = document.getElementById("prevPage");
    const next = document.getElementById("nextPage");
    const first = document.getElementById("firstPage");
    const last = document.getElementById("lastPage");

    if (prev) prev.onclick = () => changePage(state.currentPage - 1);
    if (next) next.onclick = () => changePage(state.currentPage + 1);
    if (first) first.onclick = () => changePage(1);
    if (last) last.onclick = () => changePage(Math.ceil(state.currentFilteredData.length / 20)); // Approximate total pages. Better to calc exactly but state access is needed. 
    // Wait, last button needs total pages. 
    // changePage logic should handle max clamp.
    // Let's assume changePage handles or we pass max.
    // To be safe, let's use renderPagination's logic: Math.ceil(total / itemsPerPage).
    // But itemsPerPage is dynamic.
    // Let's use a closure or dynamic look up.
    if (last) last.onclick = () => {
        const itemsPerPageSelect = document.getElementById("itemsPerPage");
        const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;
        const total = Math.ceil(state.currentFilteredData.length / itemsPerPage);
        changePage(total);
    };

    // Items Per Page Change
    const itemsSelect = document.getElementById("itemsPerPage");
    if (itemsSelect) {
        itemsSelect.onchange = () => {
            state.currentPage = 1;
            renderTableData();
            import('../ui.js').then(ui => ui.renderPagination(state.currentFilteredData.length, state.currentPage, 'pageNumbers', parseInt(itemsSelect.value, 10)));
        };
    }
}, 0);
