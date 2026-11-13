import { state } from './state.js';
import { checkAuthForRequisition, loadEmployeeData } from './auth.js';
import { getStorageBinValue, extractIdFromUrlWeb, parseSafeFloat } from './utils.js';
import { apiFetch } from './api.js';
import { getBorrowTotal, loadBorrowData, showBorrowPopup } from './loans.js?v=3';

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
        <p><strong>เริ่มต้น</strong><br>1) ล็อกอิน User และ Password <br>2) เลือกแท็บที่ต้องการด้านล่าง (ค้นหาอะไหล่ / รูปภาพ / เบิกวันนี้ / งานค้าง)</p>
        <p><strong>ค้นหาอะไหล่</strong><br>- พิมพ์คำค้นในช่อง ค้นหา1/ค้นหา2 แล้วผลจะกรองอัตโนมัติ<br>- คลิกรูปหรือแถวเพื่อดูรายละเอียดและกด “เบิก” (ถ้ามีสิทธิ์)</p>
        <p><strong>ค้นหารูป</strong><br>- ใช้คำค้นเหมือนแท็บอะไหล่ ภาพจะแสดงเป็นการ์ด<br>- คลิกรูปเพื่อเปิด popup ดูข้อมูลอะไหล่</p>
        <p><strong>เบิกวันนี้ / งานค้าง</strong><br>- ดูสถานะการเบิกวันนี้หรือรายการที่รอ<br>- ใช้ปุ่มตัวกรองและค้นหาเพื่อตรวจสอบข้อมูล</p>
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
    const modalUserTeam = document.getElementById('modalUserTeam');
    modalUserTeam.textContent = 'กำลังโหลด...';
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

    const setUserTeam = team => {
        modalUserTeam.textContent = team || 'ไม่พบข้อมูลหน่วยงาน';
        modalUserTeam.style.color = team ? '#1976d2' : '#e74c3c';
    };
    const cachedTeam = localStorage.getItem('userTeam') || '';
    const employee = state.employeeData.find(
        item => String(item.IDRec || '').trim() === String(savedUsername || '').trim()
    );
    const currentTeam = String(employee?.หน่วยงาน || cachedTeam).trim();
    if (currentTeam) {
        setUserTeam(currentTeam);
    } else {
        loadEmployeeData()
            .then(employees => {
                if (localStorage.getItem('username') !== savedUsername) return;
                const currentEmployee = employees.find(
                    item => String(item.IDRec || '').trim() === String(savedUsername || '').trim()
                );
                const team = String(currentEmployee?.หน่วยงาน || '').trim();
                if (team) localStorage.setItem('userTeam', team);
                setUserTeam(team);
            })
            .catch(error => {
                console.error('Failed to load user department:', error);
                if (localStorage.getItem('username') === savedUsername) {
                    modalUserTeam.textContent = 'โหลดข้อมูลไม่สำเร็จ';
                    modalUserTeam.style.color = '#e74c3c';
                }
            });
    }

    const adminSection = document.getElementById('adminAnnouncementSection');
    const adminAnnouncementListSection = document.getElementById('adminAnnouncementListSection');
    if (isAdminAuth && adminSection) {
        adminSection.style.display = 'flex';
    } else if (adminSection) {
        adminSection.style.display = 'none';
    }
    if (adminAnnouncementListSection) {
        adminAnnouncementListSection.style.display = isAdminAuth ? 'flex' : 'none';
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
let announcementsCache = [];
let autoAnnouncementChecked = false;
let announcementsCacheLoaded = false;
let announcementsRequest = null;
let announcementsCacheGeneration = 0;
let announcementDeckRequested = false;
const ANNOUNCEMENTS_CACHE_KEY = 'announcementSessionCache';

function readAnnouncementSessionCache() {
    try {
        const cached = sessionStorage.getItem(ANNOUNCEMENTS_CACHE_KEY);
        if (!cached) return null;

        const parsed = JSON.parse(cached);
        const username = localStorage.getItem('username') || '';
        if (parsed.username !== username || !Array.isArray(parsed.data)) {
            sessionStorage.removeItem(ANNOUNCEMENTS_CACHE_KEY);
            return null;
        }
        return parsed.data;
    } catch (error) {
        console.warn('Unable to read announcement session cache:', error);
        return null;
    }
}

function saveAnnouncementSessionCache() {
    try {
        sessionStorage.setItem(ANNOUNCEMENTS_CACHE_KEY, JSON.stringify({
            username: localStorage.getItem('username') || '',
            data: announcementsCache
        }));
    } catch (error) {
        console.warn('Unable to save announcement session cache:', error);
    }
}

async function loadAnnouncements() {
    if (announcementsCacheLoaded) return announcementsCache;

    const cachedData = readAnnouncementSessionCache();
    if (cachedData) {
        announcementsCache = cachedData;
        announcementsCacheLoaded = true;
        updateAnnouncementBadge();
        return announcementsCache;
    }
    if (announcementsRequest) return announcementsRequest;

    const requestUsername = localStorage.getItem('username') || '';
    const requestGeneration = announcementsCacheGeneration;
    const request = (async () => {
        const response = await apiFetch('/api/gas-announcement?action=getAnnouncements', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.data || 'ข้อมูลประกาศไม่ถูกต้อง');
        }
        if (
            requestGeneration !== announcementsCacheGeneration ||
            requestUsername !== (localStorage.getItem('username') || '')
        ) {
            throw new Error('เซสชันผู้ใช้เปลี่ยนระหว่างโหลดประกาศ กรุณาลองใหม่');
        }
        announcementsCache = result.data;
        announcementsCacheLoaded = true;
        saveAnnouncementSessionCache();
        updateAnnouncementBadge();
        return announcementsCache;
    })();
    announcementsRequest = request;

    try {
        return await request;
    } finally {
        if (announcementsRequest === request) announcementsRequest = null;
    }
}

function updateAnnouncementBadge() {
    const unreadCount = announcementsCache.filter(item => !item.IsRead).length;
    document.querySelectorAll('#notificationBadge, #adminAnnouncementBadge').forEach(badge => {
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        badge.style.display = unreadCount ? 'flex' : 'none';
    });
}

function createAnnouncementCard(item, { compact = false, showReadAction = true } = {}) {
    const card = document.createElement('article');
    const typeClass = compact
        ? ''
        : item.Type === 'แจ้งด่วน'
            ? 'announcement-card-urgent'
            : item.Type === 'ปิดปรับปรุง'
                ? 'announcement-card-maintenance'
                : 'announcement-card-general';
    card.className = `announcement-card ${typeClass}${item.IsRead ? ' announcement-card-read' : ' announcement-card-unread'}`;

    const header = document.createElement('div');
    header.className = 'announcement-header';

    const heading = document.createElement('div');
    heading.className = 'announcement-heading';
    const title = document.createElement('div');
    title.className = 'announcement-title';
    title.textContent = item.Title || 'ประกาศ';
    heading.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'announcement-meta';
    const createdAt = item.CreatedAt ? new Date(item.CreatedAt).toLocaleString('th-TH') : '';
    meta.textContent = createdAt;
    heading.appendChild(meta);
    header.appendChild(heading);

    if (compact) {
        const readIndicator = document.createElement('span');
        readIndicator.className = `announcement-read-indicator${item.IsRead ? ' is-read' : ' is-unread'}`;
        readIndicator.setAttribute('role', 'img');
        readIndicator.setAttribute('aria-label', item.IsRead ? 'อ่านแล้ว' : 'ยังไม่อ่าน');
        readIndicator.title = item.IsRead ? 'อ่านแล้ว' : 'ยังไม่อ่าน';
        readIndicator.innerHTML = item.IsRead
            ? '<i class="fas fa-check" aria-hidden="true"></i>'
            : '<i class="fas fa-circle" aria-hidden="true"></i>';
        header.appendChild(readIndicator);
    }

    if (!compact) {
        const headerIcon = document.createElement('span');
        headerIcon.className = 'announcement-header-icon';
        headerIcon.setAttribute('aria-hidden', 'true');
        headerIcon.innerHTML = item.Type === 'แจ้งด่วน'
            ? '<i class="fas fa-bullhorn"></i>'
            : item.Type === 'ปิดปรับปรุง'
                ? '<i class="fas fa-screwdriver-wrench"></i>'
                : '<i class="fas fa-bell"></i>';
        header.prepend(headerIcon);

        const typeBadge = document.createElement('span');
        typeBadge.className = 'announcement-type-badge';
        typeBadge.textContent = item.Type || 'ทั่วไป';
        header.appendChild(typeBadge);
    }
    card.appendChild(header);

    if (!compact) {
        const body = document.createElement('div');
        body.className = 'announcement-body show';
        body.textContent = item.Message || '';
        card.appendChild(body);
    }

    if (compact) {
        card.classList.add('announcement-card-summary');
        card.dataset.announcementId = String(item.AnnouncementID || '');
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `เปิดประกาศ ${item.Title || ''}`);
        return card;
    }

    const actions = document.createElement('div');
    actions.className = 'announcement-actions';
    if (item.IsRead) {
        const readLabel = document.createElement('span');
        readLabel.className = 'announcement-read-label';
        readLabel.textContent = 'อ่านแล้ว';
        actions.appendChild(readLabel);
    } else if (showReadAction) {
        const readButton = document.createElement('button');
        readButton.type = 'button';
        readButton.className = 'announcement-read-button';
        readButton.textContent = 'อ่านแล้ว';
        readButton.addEventListener('click', async () => {
            readButton.disabled = true;
            Swal.resetValidationMessage();
            try {
                await markAnnouncementRead(item);
                item.IsRead = true;
                saveAnnouncementSessionCache();
                updateAnnouncementBadge();
                const readLabel = document.createElement('span');
                readLabel.className = 'announcement-read-label';
                readLabel.textContent = 'อ่านแล้ว';
                actions.replaceChildren(readLabel);
            } catch (error) {
                readButton.disabled = false;
                Swal.showValidationMessage(error.message || 'บันทึกสถานะอ่านไม่สำเร็จ');
            }
        });
        actions.appendChild(readButton);
    }
    card.appendChild(actions);
    return card;
}

async function markAnnouncementRead(item) {
    const body = new URLSearchParams({
        action: 'markAnnouncementRead',
        announcementId: String(item.AnnouncementID || '')
    });
    const response = await apiFetch('/api/gas-announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (result.status !== 'success') throw new Error(result.data || 'บันทึกสถานะอ่านไม่สำเร็จ');
}

function renderAnnouncementDeck(announcements = announcementsCache) {
    const root = document.createElement('div');
    root.className = 'announcement-deck';
    const sorted = [...announcements].sort((a, b) => {
        const dateA = Date.parse(a.CreatedAt || '') || 0;
        const dateB = Date.parse(b.CreatedAt || '') || 0;
        return dateB - dateA;
    });
    const heading = document.createElement('div');
    heading.className = 'announcement-deck-heading';
    const unreadCount = sorted.filter(item => !item.IsRead).length;
    heading.textContent = unreadCount
        ? `มี ${sorted.length} ประกาศ · ยังไม่อ่าน ${unreadCount} รายการ`
        : `มี ${sorted.length} ประกาศ · อ่านครบแล้ว`;
    root.appendChild(heading);

    if (sorted.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'announcement-empty-state';
        empty.innerHTML = '<i class="fas fa-inbox" aria-hidden="true"></i>';
        const message = document.createElement('p');
        message.textContent = 'ยังไม่มีข่าวหรือประกาศในขณะนี้';
        empty.appendChild(message);
        root.appendChild(empty);
        return root;
    }
    sorted.forEach(item => root.appendChild(createAnnouncementCard(item, { compact: true, showReadAction: false })));
    return root;
}

async function openAnnouncementDetail(item, announcements = announcementsCache, showReadAction = true) {
    const result = await Swal.fire({
        title: 'รายละเอียดประกาศ',
        html: createAnnouncementCard(item, { showReadAction }),
        width: '600px',
        confirmButtonText: 'กลับไปยังรายการ',
        showCloseButton: true,
        customClass: { popup: 'announcement-popup announcement-detail-popup' }
    });
    if (result.isConfirmed) showAnnouncementDeck(announcements, { showReadAction });
}

function showAnnouncementDeck(announcements = announcementsCache, { showReadAction = true } = {}) {
    Swal.fire({
        title: '📢 ข่าวและประกาศ',
        html: renderAnnouncementDeck(announcements),
        width: '600px',
        confirmButtonText: 'ปิด',
        customClass: { popup: 'announcement-popup announcement-deck-popup' },
        didOpen: popup => bindAnnouncementDeck(popup, announcements, showReadAction)
    });
}

function bindAnnouncementDeck(popup, announcements, showReadAction) {
    const deck = popup.querySelector('.announcement-deck');
    if (!deck) return;

    const openFromEvent = event => {
        const card = event.target.closest('.announcement-card-summary');
        if (!card || !deck.contains(card)) return;
        const item = announcements.find(
            announcement => String(announcement.AnnouncementID || '') === card.dataset.announcementId
        );
        if (item) openAnnouncementDetail(item, announcements, showReadAction);
    };
    deck.addEventListener('click', openFromEvent);
    deck.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openFromEvent(event);
    });
}

export async function openAnnouncementDeck() {
    announcementDeckRequested = true;
    const cachedData = announcementsCacheLoaded ? announcementsCache : readAnnouncementSessionCache();
    if (cachedData) {
        announcementsCache = cachedData;
        announcementsCacheLoaded = true;
        updateAnnouncementBadge();
        showAnnouncementDeck(cachedData);
        return;
    }

    // Open the dialog immediately so the UI responds while the first network request is in flight.
    Swal.fire({
        title: '📢 ข่าวและประกาศ',
        html: '<div class="announcement-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><p>กำลังโหลดข่าวและประกาศ…</p></div>',
        width: '600px',
        showConfirmButton: false,
        allowOutsideClick: false,
        customClass: { popup: 'announcement-popup announcement-deck-popup' },
        didOpen: () => Swal.showLoading()
    });

    try {
        const announcements = await loadAnnouncements();
        Swal.hideLoading();
        Swal.update({
            html: renderAnnouncementDeck(announcements),
            showConfirmButton: true,
            confirmButtonText: 'ปิด',
            allowOutsideClick: true
        });
        bindAnnouncementDeck(Swal.getPopup(), announcements, true);
    } catch (error) {
        console.error('Failed to load announcements:', error);
        Swal.hideLoading();
        Swal.update({
            title: 'โหลดประกาศไม่สำเร็จ',
            html: `<p>${String(error.message || 'กรุณาลองใหม่อีกครั้ง').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])}</p>`,
            showConfirmButton: true,
            confirmButtonText: 'ปิด',
            allowOutsideClick: true
        });
    }
}

export async function openAdminAnnouncementDeck() {
    if (localStorage.getItem('userAuth') !== 'Admin') {
        await Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่ดูประกาศทั้งหมดได้', 'warning');
        return;
    }

    // This menu loads the full announcement list from GAS. Show the dialog before waiting on that request.
    Swal.fire({
        title: '📢 ข่าวและประกาศ',
        html: '<div class="announcement-loading"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i><p>กำลังโหลดข่าวและประกาศ…</p></div>',
        width: '600px',
        showConfirmButton: false,
        allowOutsideClick: false,
        customClass: { popup: 'announcement-popup announcement-deck-popup' },
        didOpen: () => Swal.showLoading()
    });

    try {
        const response = await apiFetch('/api/gas-announcement?action=getAnnouncements&includeAll=true', {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        if (result.status !== 'success' || !Array.isArray(result.data)) {
            throw new Error(result.data || 'ข้อมูลประกาศไม่ถูกต้อง');
        }
        Swal.hideLoading();
        Swal.update({
            html: renderAnnouncementDeck(result.data),
            showConfirmButton: true,
            confirmButtonText: 'ปิด',
            allowOutsideClick: true
        });
        bindAnnouncementDeck(Swal.getPopup(), result.data, false);
    } catch (error) {
        console.error('Failed to load all announcements:', error);
        Swal.hideLoading();
        Swal.update({
            title: 'โหลดประกาศไม่สำเร็จ',
            html: `<p>${String(error.message || 'กรุณาลองใหม่อีกครั้ง').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])}</p>`,
            showConfirmButton: true,
            confirmButtonText: 'ปิด',
            allowOutsideClick: true
        });
    }
}

export async function openAnnouncementEditor() {
    if (localStorage.getItem('userAuth') !== 'Admin') {
        await Swal.fire('ไม่มีสิทธิ์', 'เฉพาะผู้ดูแลระบบเท่านั้นที่สร้างประกาศได้', 'warning');
        return;
    }

    const now = new Date();
    const localDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    const result = await Swal.fire({
        title: 'สร้างประกาศใหม่',
        html: `
            <div class="announcement-form">
                <div class="announcement-form-intro">กรอกข้อมูลด้านล่างเพื่อแจ้งข่าวให้ผู้ใช้งาน</div>
                <label for="announcementTitle">หัวข้อประกาศ</label>
                <input id="announcementTitle" class="swal2-input" maxlength="160" placeholder="ระบุหัวข้อ">
                <label for="announcementMessage">รายละเอียด</label>
                <textarea id="announcementMessage" class="swal2-textarea" maxlength="10000" placeholder="พิมพ์รายละเอียดประกาศ"></textarea>
                <label for="announcementType">ประเภท</label>
                <select id="announcementType" class="swal2-select">
                    <option value="ทั่วไป">📣 ทั่วไป</option>
                    <option value="แจ้งด่วน">🚨 แจ้งด่วน</option>
                    <option value="ปิดปรับปรุง">🛠 ปิดปรับปรุง</option>
                </select>
                <div class="announcement-form-section-title">กำหนดเวลาแสดง</div>
                <div class="announcement-form-grid">
                    <div class="announcement-form-field">
                        <label for="announcementStartAt">เริ่มแสดง</label>
                        <input id="announcementStartAt" class="swal2-input" type="datetime-local" value="${localDateTime}">
                    </div>
                    <div class="announcement-form-field">
                        <label for="announcementEndAt">สิ้นสุด (เว้นว่างได้)</label>
                        <input id="announcementEndAt" class="swal2-input" type="datetime-local">
                    </div>
                </div>
                <div class="announcement-form-section-title">กลุ่มผู้รับ</div>
                <div class="announcement-form-field">
                    <label for="announcementTargetTeam">หน่วยงาน</label>
                    <input id="announcementTargetTeam" class="swal2-input" value="*" maxlength="500" placeholder="* ทุกหน่วยงาน หรือระบุชื่อหน่วยงาน">
                    <small class="announcement-form-hint">ระบุหลายหน่วยงานได้ โดยคั่นด้วยเครื่องหมายจุลภาค (,)</small>
                </div>
                <div class="announcement-form-field">
                    <label for="announcementTargetEmployeeCodes">รหัสพนักงาน (ตัวเลือก)</label>
                    <input id="announcementTargetEmployeeCodes" class="swal2-input" maxlength="1000" placeholder="เว้นว่าง = ไม่จำกัดรหัสพนักงาน">
                    <small class="announcement-form-hint">ระบุรหัสเดียวหรือหลายรหัส คั่นด้วยจุลภาค (,); หากระบุ จะต้องตรงกับเงื่อนไขหน่วยงานและ Plant ด้วย</small>
                </div>
                <div class="announcement-form-field">
                    <label for="announcementTargetPlant">Plant (ตัวเลือก)</label>
                    <input id="announcementTargetPlant" class="swal2-input" value="*" placeholder="* ทุก Plant หรือระบุ เช่น 0001,0002">
                </div>
            </div>
        `,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'บันทึกประกาศ',
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        customClass: {
            popup: 'announcement-popup announcement-editor-popup',
            htmlContainer: 'announcement-editor-content'
        },
        preConfirm: async () => {
            const title = document.getElementById('announcementTitle').value.trim();
            const message = document.getElementById('announcementMessage').value.trim();
            const type = document.getElementById('announcementType').value;
            const startAt = document.getElementById('announcementStartAt').value;
            const endAt = document.getElementById('announcementEndAt').value;
            const targetPlant = document.getElementById('announcementTargetPlant').value.trim() || '*';
            const targetTeam = document.getElementById('announcementTargetTeam').value.trim() || '*';
            const targetEmployeeCodes = document.getElementById('announcementTargetEmployeeCodes').value.trim();

            if (!title || !message) {
                Swal.showValidationMessage('กรุณากรอกหัวข้อและรายละเอียดประกาศ');
                return false;
            }
            if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
                Swal.showValidationMessage('วันสิ้นสุดต้องอยู่หลังวันเริ่มแสดง');
                return false;
            }

            const body = new URLSearchParams({
                action: 'createAnnouncement',
                title,
                message,
                type,
                startAt,
                endAt,
                targetPlant,
                targetTeam,
                targetEmployeeCodes
            });
            try {
                const response = await apiFetch('/api/gas-announcement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: body.toString()
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error || error.data || `HTTP ${response.status}`);
                }
                const apiResult = await response.json();
                if (apiResult.status !== 'success') {
                    throw new Error(apiResult.data || 'บันทึกประกาศไม่สำเร็จ');
                }
                return apiResult.data;
            } catch (error) {
                console.error('Failed to create announcement:', error);
                Swal.showValidationMessage(error.message || 'บันทึกประกาศไม่สำเร็จ');
                return false;
            }
        }
    });

    if (result.isConfirmed) {
        resetAnnouncementState();
        await Swal.fire({
            icon: 'success',
            title: 'บันทึกประกาศแล้ว',
            text: 'ประกาศถูกบันทึกลงฐานข้อมูลเรียบร้อย',
            confirmButtonText: 'ดูประกาศ'
        });
        await openAnnouncementDeck();
    }
}

export async function showUnreadAnnouncementPopup() {
    if (autoAnnouncementChecked) return;
    autoAnnouncementChecked = true;
    try {
        await loadAnnouncements();
        // Do not replace the user's announcement list with the delayed automatic unread prompt.
        if (announcementDeckRequested) return;
        const unread = announcementsCache.find(item => !item.IsRead);
        if (!unread) return;
        Swal.fire({
            title: '📢 ประกาศใหม่',
            html: createAnnouncementCard(unread, { showReadAction: false }),
            showCancelButton: true,
            confirmButtonText: 'รับทราบ',
            cancelButtonText: 'ปิดไว้ก่อน',
            allowOutsideClick: false,
            customClass: { popup: 'announcement-popup' },
            preConfirm: async () => {
                try {
                    await markAnnouncementRead(unread);
                    unread.IsRead = true;
                    saveAnnouncementSessionCache();
                    updateAnnouncementBadge();
                    return true;
                } catch (error) {
                    Swal.showValidationMessage(error.message || 'บันทึกสถานะอ่านไม่สำเร็จ');
                    return false;
                }
            }
        });
    } catch (error) {
        console.error('Failed to check unread announcements:', error);
        Swal.fire('โหลดประกาศไม่สำเร็จ', error.message || 'กรุณาลองใหม่อีกครั้ง', 'warning');
    }
}

export function resetAnnouncementState() {
    autoAnnouncementChecked = false;
    announcementDeckRequested = false;
    announcementsCacheGeneration += 1;
    announcementsCache = [];
    announcementsCacheLoaded = false;
    announcementsRequest = null;
    try {
        sessionStorage.removeItem(ANNOUNCEMENTS_CACHE_KEY);
    } catch (error) {
        console.warn('Unable to clear announcement session cache:', error);
    }
    updateAnnouncementBadge();
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
