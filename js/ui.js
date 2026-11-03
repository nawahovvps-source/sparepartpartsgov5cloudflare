import { state } from './state.js';
import { checkAuthForRequisition } from './auth.js';
import { getStorageBinValue, extractIdFromUrlWeb, parseDateTimeToJSDate, parseSafeFloat } from './utils.js';
import { apiFetch } from './api.js';
import { getBorrowTotal, loadBorrowData, showBorrowPopup } from './loans.js';

export function hideLoading() {
    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
}

// ... [Existing UI exports from previous step] ...
// I will reproduce the full content + openAnnouncementDeck for completeness since replace is tricky with large files if I don't see it all.
// Actually I simply append/replace necessary parts. 
// But write_to_file overwrites.
// I will rewrite the whole file to be safe and include openAnnouncementDeck.

export function showQRCode() {
    Swal.fire({
        title: '📷 สแกน QR Code',
        html: `
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=https://request-nawanakorn.vercel.app/" alt="QR Code" class="swal2-qrcode" style="width: 150px; height: 150px;">
            <p>สแกนเพื่อเข้าสู่ระบบขอเบิกอะไหล่</p>
          `,
        confirmButtonText: 'ปิด',
        customClass: { popup: 'swal2-popup', title: 'swal2-title', confirmButton: 'swal2-confirm' }
    });
}

export function showHelp() {
    Swal.fire({
        title: 'วิธีใช้งาน PartsGo',
        html: `
      <div style="text-align:left;font-size:15px;line-height:1.5;">
        <p><strong>วัตถุประสงค์</strong><br>ค้นหาอะไหล่ ดูรูป เช็กสต็อก และส่งคำขอเบิกได้ด้วยตัวเอง</p>
        <p><strong>เริ่มต้น</strong><br>1) ล็อกอิน User และ Password <br>2) เลือกแท็บที่ต้องการด้านล่าง (ค้นหาอะไหล่ / รูปภาพ / เบิกวันนี้ / Call)</p>
        <p><strong>ค้นหาอะไหล่</strong><br>- พิมพ์คำค้นในช่อง ค้นหา1/ค้นหา2 แล้วผลจะกรองอัตโนมัติ<br>- คลิกรูปหรือแถวเพื่อดูรายละเอียดและกด “เบิก” (ถ้ามีสิทธิ์)</p>
        <p><strong>ค้นหารูป</strong><br>- ใช้คำค้นเหมือนแท็บอะไหล่ ภาพจะแสดงเป็นการ์ด<br>- คลิกรูปเพื่อเปิด popup ดูข้อมูลอะไหล่</p>
        <p><strong>เบิกวันนี้ / Call</strong><br>- ดูสถานะการเบิกวันนี้หรือรายการ Call ที่รอ<br>- ใช้ปุ่มตัวกรองและค้นหาเพื่อตรวจสอบรายละเอียด</p>
        <p><strong>ทริก</strong><br>- ปุ่ม Clear ล้างคำค้นทั้งสองช่อง<br>- ปุ่ม Update ในเมนูช่วยรีเฟรชแคชหากข้อมูลไม่อัปเดต</p>
      </div>
    `,
        confirmButtonText: 'รับทราบ',
        width: '650px'
    });
}

// Settings Dragging Logic
let settingsDragInitialized = false;

export function resetSettingsPosition() {
    const modalContent = document.querySelector('.settings-modal-content');
    if (!modalContent) return;
    modalContent.style.left = '50%';
    modalContent.style.top = '50%';
    modalContent.style.transform = 'translate(-50%, -50%)';
    modalContent.classList.remove('dragging');
}

export function setupSettingsDragging() {
    if (settingsDragInitialized) return;
    const modalContent = document.querySelector('.settings-modal-content');
    const dragHandle = document.querySelector('.settings-topbar');
    if (!modalContent || !dragHandle) return;
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    const startDrag = (event) => {
        if (event.target.closest('.close-settings')) return;
        const e = event.touches ? event.touches[0] : event;
        isDragging = true;
        const rect = modalContent.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        modalContent.classList.add('dragging');
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag);
        document.addEventListener('mouseup', endDrag);
        document.addEventListener('touchend', endDrag);
    };
    const onDrag = (event) => {
        if (!isDragging) return;
        const e = event.touches ? event.touches[0] : event;
        if (event.cancelable) event.preventDefault();
        const rect = modalContent.getBoundingClientRect();
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;
        const maxLeft = window.innerWidth - rect.width - 12;
        const maxTop = window.innerHeight - rect.height - 12;
        newLeft = Math.min(Math.max(newLeft, 12), Math.max(maxLeft, 12));
        newTop = Math.min(Math.max(newTop, 12), Math.max(maxTop, 12));
        modalContent.style.left = `${newLeft}px`;
        modalContent.style.top = `${newTop}px`;
        modalContent.style.transform = 'none';
    };
    const endDrag = () => {
        isDragging = false;
        modalContent.classList.remove('dragging');
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchend', endDrag);
    };
    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag);
    settingsDragInitialized = true;
}

export function showSettings() {
    setupSettingsDragging();
    resetSettingsPosition();
    const currentTheme = localStorage.getItem('theme') || 'light';
    const savedUsername = localStorage.getItem('username');
    const savedUserName = localStorage.getItem('userName') || 'ไม่พบชื่อ';
    const userPlant = localStorage.getItem('userPlant') || '';
    const userAuth = localStorage.getItem('userAuth') || 'None';
    const isAdminAuth = userAuth === 'Admin';
    // Fix: Treat empty userPlant (Vibhavadi 62) as active if they have valid Auth
    const isActiveAuth = userAuth !== 'None' && (userPlant === 'None' || userPlant === '' || userPlant === null || userPlant !== 'None');

    document.getElementById('modalUserName').textContent = savedUserName;
    document.getElementById('modalUserID').textContent = savedUsername || '-';
    document.getElementById('modalUserTeam').textContent = 'กำลังโหลด...';
    document.getElementById('modalUserAuth').textContent = isAdminAuth ? 'Admin' : isActiveAuth ? 'Active' : 'None';
    document.getElementById('themeSelect').value = currentTheme;
    const modalPlantEl = document.getElementById('modalUserPlant');
    if (modalPlantEl) {
        modalPlantEl.textContent = (userPlant && userPlant !== 'None') ? `Plant: ${userPlant}` : 'Spare part วิภาวดี 62';
    }

    const authElement = document.getElementById('modalUserAuth');
    if (isAdminAuth) {
        authElement.style.color = '#6c5ce7';
        authElement.style.fontWeight = 'bold';
    } else if (isActiveAuth) {
        authElement.style.color = '#27ae60';
        authElement.style.fontWeight = 'bold';
    } else {
        authElement.style.color = '#e74c3c';
        authElement.style.fontWeight = 'bold';
    }

    try {
        const user = state.employeeData.find(e => e.IDRec?.toString().trim() === savedUsername);
        document.getElementById('modalUserTeam').textContent = user?.หน่วยงาน || 'ไม่พบข้อมูลหน่วยงาน';
        document.getElementById('modalUserTeam').style.color = user?.หน่วยงาน ? '#1976d2' : '#e74c3c';
    } catch (err) {
        document.getElementById('modalUserTeam').textContent = 'โหลดข้อมูลไม่สำเร็จ';
        document.getElementById('modalUserTeam').style.color = '#e74c3c';
    }

    const adminSection = document.getElementById('adminAnnouncementSection');
    if (isAdminAuth && adminSection) {
        adminSection.style.display = 'flex';
    } else if (adminSection) {
        adminSection.style.display = 'none';
    }

    document.getElementById('settingsModal').style.display = 'block';

    const themeSelect = document.getElementById('themeSelect');
    themeSelect.onchange = null;
    themeSelect.addEventListener('change', function (e) {
        import('./theme.js').then(module => module.setTheme(e.target.value));
    });

    window.dispatchEvent(new CustomEvent('request-version-update'));
}

export function getModalElement(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return null;
    const parent = modal.parentElement;
    if (parent && parent.classList.contains('tab-content')) {
        document.body.appendChild(modal);
    }
    return modal;
}

// Swiper logic variables
let currentSwiperIndex = {};

export function showDetailModal(row, modalId, contentId, options = {}) {
    const { showInfo = true } = options;
    const material = (row.Material || "").toString().trim();
    const userPlant = localStorage.getItem('userPlant') || 'None';
    const savedUsername = localStorage.getItem('username');
    const hasPermission = savedUsername === '7512411' || (userPlant && userPlant !== 'None');

    let galleryHtml = '';
    let imageIds = [];

    if (state.imageDbLoaded && state.imageDatabase[material] && state.imageDatabase[material].length > 0) {
        imageIds = state.imageDatabase[material];
    }
    else if (row.UrlWeb && typeof row.UrlWeb === 'string') {
        const id = extractIdFromUrlWeb(row.UrlWeb);
        if (id) imageIds = [id];
    }

    if (imageIds.length === 0) {
        galleryHtml = `
    <div style="width:380px;height:380px;background:#000;display:flex;align-items:center;justify-content:center;margin:0 auto;color:#ccc;font-size:20px;">
      ไม่มีรูปภาพในระบบ
    </div>`;
    }
    else {
        galleryHtml = `
    <div class="image-swiper-container">
      <div class="image-swiper-wrapper" style="width:${imageIds.length * 100}%;">
        ${imageIds.map(id => `
          <div class="image-slide">
            <img src="https://drive.google.com/thumbnail?id=${id}&sz=s1200"
                 alt="รูปอะไหล่"
                 loading="lazy"
                 referrerpolicy="no-referrer"
                 onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 300 200\'%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'#f0f0f0\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' font-family=\'Arial\' font-size=\'16\' fill=\'#999\' text-anchor=\'middle\' dy=\'.3em\'%3ENo Image%3C/text%3E%3C/svg%3E';">
          </div>
        `).join('')}
      </div>
      ${imageIds.length > 1 ? `
        <button class="swiper-btn swiper-prev" onclick="handleSwiperPrev(this)">‹</button>
        <button class="swiper-btn swiper-next" onclick="handleSwiperNext(this)">›</button>
        <div class="swiper-counter">1 / ${imageIds.length}</div>
      ` : ''}
    </div>`;
    }

    let requisitionButtonHtml = '';
    if (showInfo) {
        if (hasPermission) {
            requisitionButtonHtml = `
        <button class="requisition-button header-btn" onclick='showRequisitionDialog(${JSON.stringify(row).replace(/"/g, '&quot;')})'>
          เบิก
        </button>
      `;
        } else {
            requisitionButtonHtml = `
        <button class="requisition-button-disabled header-btn" onclick="checkAuthForRequisition()" 
                title="ไม่มีสิทธิ์เบิกอะไหล่" style="opacity:0.7; cursor:not-allowed;">
          เบิก
        </button>
      `;
        }
    }

    const infoHtml = showInfo ? `
    <div class="detail-info">
      <div class="detail-header-row">
        <h2>รายละเอียดอะไหล่</h2>
        ${requisitionButtonHtml}
      </div>
      <div class="detail-row"><span class="label">Material</span><span class="value">${material}</span></div>
      <div class="detail-row"><span class="label">Description</span><span class="value">${row.Description || '-'}</span></div>
      <div class="detail-row"><span class="label">Storage bin</span><span class="value">${getStorageBinValue(row) || '-'}</span></div>
      <div class="detail-row"><span class="label">คงเหลือ</span><span class="value">${row["วิภาวดี"] ? parseSafeFloat(row["วิภาวดี"]).toLocaleString() + ' ชิ้น' : '0 ชิ้น'}</span></div>
      <div class="detail-row"><span class="label">นวนคร</span><span class="value">${row["Unrestricted"] ? parseSafeFloat(row["Unrestricted"]).toLocaleString() + ' ชิ้น' : '0 ชิ้น'}</span></div>
      ${row["Rebuilt"] ? `<div class="detail-row"><span class="label">Rebuilt</span><span class="value rebuilt-text">${row["Rebuilt"]}</span></div>` : ''}
      ${row["Product"] ? `<div class="detail-row"><span class="label">Product</span><span class="value">${row["Product"]}</span></div>` : ''}
      ${row["OCRTAXT"] ? `<div class="detail-row"><span class="label">Spec</span><span class="value spec-text">${row["OCRTAXT"]}</span></div>` : ''}
      ${row["หมายเหตุ"] ? `<div class="detail-row"><span class="label" style="color:#e74c3c;font-weight:bold;">หมายเหตุ</span><span class="value" style="color:#e74c3c;font-weight:bold;">${row["หมายเหตุ"]}</span></div>` : ''}
      
      <div class="detail-row" style="margin-top:15px; padding-top:15px; border-top:1px dashed #ddd;">
        <span class="label" style="color:#7f8c8d;">สถานะสิทธิ์:</span>
        <span class="value" style="color:${hasPermission ? '#27ae60' : '#e74c3c'}; font-weight:bold;">
          ${hasPermission ? '✓ สามารถเบิกได้' : '✗ ไม่มีสิทธิ์เบิก'}
        </span>
      </div>
    </div>
  ` : '';

    const modal = getModalElement(modalId);
    const content = document.getElementById(contentId);
    if (!modal || !content) return;
    content.innerHTML = galleryHtml + infoHtml;
    if (showInfo) {
        const borrowRow = document.createElement('div');
        borrowRow.className = 'detail-row borrow-detail-row';
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = 'ค้างยืม';
        const value = document.createElement('span');
        value.className = 'value';
        value.textContent = state.borrowDataLoaded ? `${getBorrowTotal(material).toLocaleString()} ชิ้น` : 'กำลังโหลด...';
        if (state.borrowDataLoaded && getBorrowTotal(material) > 0) {
            value.classList.add('borrow-detail-clickable');
            value.title = 'คลิกเพื่อดูรายการค้างยืม';
            value.onclick = () => showBorrowPopup(material);
        }
        borrowRow.append(label, value);
        const detailInfo = content.querySelector('.detail-info');
        if (detailInfo) {
            const stockRow = Array.from(detailInfo.querySelectorAll('.detail-row'))
                .find(detailRow => detailRow.querySelector('.label')?.textContent.trim() === 'นวนคร');
            detailInfo.insertBefore(borrowRow, stockRow ? stockRow.nextSibling : detailInfo.lastElementChild);
        }

        if (!state.borrowDataLoaded) {
            loadBorrowData().then(() => {
                if (!borrowRow.isConnected) return;
                const total = getBorrowTotal(material);
                value.textContent = `${total.toLocaleString()} ชิ้น`;
                if (total > 0) {
                    value.classList.add('borrow-detail-clickable');
                    value.title = 'คลิกเพื่อดูรายการค้างยืม';
                    value.onclick = () => showBorrowPopup(material);
                }
            }).catch(error => {
                console.error('Failed to load borrow details for part:', error);
                if (borrowRow.isConnected) value.textContent = 'โหลดข้อมูลไม่สำเร็จ';
            });
        }
    }
    modal.style.display = 'block';
    modal.scrollTop = 0;
    document.body.style.overflow = 'hidden';

    if (imageIds.length > 1) {
        setTimeout(() => initSwiper(modal, imageIds.length), 150);
    }
}

export function initSwiper(modal) {
    const container = modal.querySelector('.image-swiper-container');
    if (!container) return;

    const wrapper = container.querySelector('.image-swiper-wrapper');
    const counter = container.querySelector('.swiper-counter');
    const modalId = modal.id;

    currentSwiperIndex[modalId] = currentSwiperIndex[modalId] || 0;
    const totalSlides = wrapper.children.length;

    const updateSlide = () => {
        const idx = currentSwiperIndex[modalId];
        wrapper.style.transform = `translateX(-${idx * 100}%)`;
        if (counter) counter.textContent = `${idx + 1} / ${totalSlides}`;
    };

    // Drag logic is usually needed here too
    updateSlide();
}

export function handleSwiperPrev(btn) {
    const container = btn.closest('.image-swiper-container');
    const modalId = container.closest('.image-modal, .image-modal-images').id;
    const prevIdx = (currentSwiperIndex[modalId] || 0) - 1;
    const total = container.querySelector('.image-swiper-wrapper').children.length;
    currentSwiperIndex[modalId] = prevIdx < 0 ? total - 1 : prevIdx;
    initSwiper(document.getElementById(modalId));
}

export function handleSwiperNext(btn) {
    const container = btn.closest('.image-swiper-container');
    const modalId = container.closest('.image-modal, .image-modal-images').id;
    const wrapper = container.querySelector('.image-swiper-wrapper');
    const total = wrapper.children.length;
    let nextIdx = (currentSwiperIndex[modalId] || 0) + 1;
    currentSwiperIndex[modalId] = nextIdx >= total ? 0 : nextIdx;
    initSwiper(document.getElementById(modalId));
}

export function closeAllImageModals() {
    const m1 = document.getElementById('imageModal');
    const m2 = document.getElementById('imageModalImages');
    if (m1) m1.style.display = 'none';
    if (m2) m2.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentSwiperIndex = {};
}

// Announcement Logic
export async function openAnnouncementDeck() {
    console.log('เปิดหน้าต่างประกาศ...');
    Swal.fire({
        title: 'กำลังโหลดประกาศ...',
        text: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await apiFetch('/api/announcement', { cache: 'no-cache' });
        if (!res.ok) throw new Error('Load failed');
        const data = await res.json();
        if (!data || data.length === 0) {
            Swal.fire('ยังไม่มีประกาศ', 'คลังวิภาวดี 62 ยังไม่ได้ส่งประกาศล่าสุด', 'info');
            return;
        }
        const sorted = data.filter(r => r.message).sort((a, b) => {
            const dA = parseDateTimeToJSDate(a.updatedAt);
            const dB = parseDateTimeToJSDate(b.updatedAt);
            return (dB || 0) - (dA || 0);
        });

        let html = `
       <div style="max-height:65vh;overflow-y:auto;padding:5px;">
         <div style="margin-bottom:15px;padding:12px;background:#f8f9fa;border-radius:12px;text-align:center;">
           <b>มี ${sorted.length} ประกาศ</b>
         </div>
         ${sorted.map(item => `
            <div style="background:white;border:1px solid #eee;border-radius:10px;padding:15px;margin-bottom:10px;box-shadow:0 2px 5px rgba(0,0,0,0.05);text-align:left;">
                <div style="font-size:12px;color:#999;margin-bottom:5px;">
                    <i class="far fa-clock"></i> ${item.updatedAt}
                </div>
                <div style="font-size:15px;color:#333;line-height:1.5;">${item.message}</div>
                ${item.sender ? `<div style="margin-top:8px;font-size:12px;color:#2980b9;">โดย: ${item.sender}</div>` : ''}
            </div>
         `).join('')}
       </div>
    `;

        Swal.fire({
            title: '📢 ประกาศจากคลัง',
            html: html,
            width: '600px',
            confirmButtonText: 'ปิด'
        });
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'ไม่สามารถโหลดประกาศได้', 'error');
    }
}

export function renderPagination(totalItems, currentPage, containerId, itemsPerPage, prefix = "") {
    const pageNumbers = document.getElementById(containerId);
    if (!pageNumbers) {
        console.warn(`Pagination container '${containerId}' not found.`);
        return;
    }

    const totalPages = Math.ceil(totalItems / itemsPerPage);

    pageNumbers.innerHTML = "";
    const btn = document.createElement("button");
    btn.textContent = currentPage;
    btn.className = "active";
    btn.disabled = true;
    pageNumbers.appendChild(btn);

    // Update button states
    const prev = document.getElementById(`prevPage${prefix}`);
    const next = document.getElementById(`nextPage${prefix}`);
    // first/last are optional or standard
    const first = document.getElementById(`firstPage${prefix}`);
    const last = document.getElementById(`lastPage${prefix}`);

    if (prev) prev.disabled = currentPage === 1;
    if (next) next.disabled = currentPage >= totalPages || totalPages === 0;

    // Note: Event listeners should be bound separately in module init
}
