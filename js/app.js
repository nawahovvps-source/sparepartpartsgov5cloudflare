import { CONFIG } from './config.js';
import { state } from './state.js';
import {
    handleLogin,
    handleLogout,
    checkLoginStatus,
    checkAuthForRequisition
} from './auth.js';
// app.js - v18.10.39 - Force Reload
import {
    hideLoading,
    showDetailModal,
    showQRCode,
    showHelp,
    showSettings,
    handleSwiperPrev,
    handleSwiperNext,
    closeAllImageModals
} from './ui.js';
import { handleClearCacheAndReload, ensureCacheFreshForVersion } from './cache.js';
import { debounce } from './utils.js';
import { loadTheme } from './theme.js';
import { loadData, applyFilters, showRequisitionDialog } from './modules/parts.js?v=39';
import { applyFiltersImages } from './modules/images.js?v=39';
import { loadTodayData, updateTableToday, exportTodayData, saveTodayDataSnapshot, initTodayListeners } from './modules/today.js?v=39';
import { loadPendingCallsData, initPendingListeners } from './modules/pending.js?v=48';
import { loadAllData } from './modules/all.js?v=39';

// Open Announcement Deck Stub (Not found in original main.js)
function openAnnouncementDeck() {
    Swal.fire('Notification', 'Notification feature is coming soon.', 'info');
}
function openAnnouncementEditor() {
    Swal.fire('Announcement', 'Editor feature is coming soon.', 'info');
}

// Service Worker Registration
let newWorker;
let isUpdateShown = false;

function showUpdateToast() {
    // If we already showed the "Update Successful" login screen, or are in middle of updating, DON'T show toast.
    if (isUpdateShown || 
        sessionStorage.getItem('updateInProgress') || 
        localStorage.getItem('versionUpdatedPrompt')) {
        console.log('SW: Update toast skipped (update in progress or recently finished)');
        return;
    }
    isUpdateShown = true;
    console.log('SW: Showing update toast');
    Swal.fire({
        title: 'มีอัปเดตใหม่!',
        html: 'แอปได้รับการปรับปรุงแล้ว<br><small>กดรีเฟรชเพื่อใช้งานเวอร์ชันล่าสุด</small>',
        icon: 'info',
        confirmButtonText: 'รีเฟรชเลย',
        cancelButtonText: 'ภายหลัง',
        showCancelButton: true,
        allowOutsideClick: false,
        timer: 20000,
        timerProgressBar: true,
        customClass: { popup: 'animated bounceIn' }
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.setItem('updateInProgress', 'true');
            if (newWorker) {
                console.log('SW: Sending SKIP_WAITING to worker');
                newWorker.postMessage({ type: 'SKIP_WAITING' });
            } else {
                window.location.reload();
            }
        }
    });
}

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(reg => {
            console.log('SW registered', reg);

            // Check if there's already a waiting worker
            if (reg.waiting) {
                console.log('SW: waiting worker found at register');
                newWorker = reg.waiting;
                showUpdateToast();
            }

            // Optional: check for update on every load
            reg.update().catch(err => console.log('SW update check failed:', err));

            reg.addEventListener('updatefound', () => {
                console.log('SW: update found event');
                newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    console.log('SW: state changed to', newWorker.state);
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('SW: update ready (installed)');
                        showUpdateToast();
                    }
                });
            });
        })
        .catch(err => console.log('SW registration failed:', err));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('SW: Controller changed, performing smart cleanup...');

        // Keep the current account and its cached data across a service worker update.
        localStorage.setItem('versionUpdatedPrompt', 'true');

        console.log('SW: Final reload for update');
        window.location.reload();
    });
}

function updateAppVersionDisplay() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' });
    } else {
        const versionElement = document.getElementById('appVersion');
        if (versionElement) versionElement.textContent = 'v??';
    }
}

navigator.serviceWorker.addEventListener('message', async event => {
    if (event.data && event.data.type === 'VERSION') {
        const versionElement = document.getElementById('appVersion');
        if (versionElement) {
            versionElement.textContent = event.data.version;
            versionElement.style.fontWeight = 'bold';
            versionElement.style.color = '#1e88e5';
        }
        await ensureCacheFreshForVersion(event.data.version);
    }
});

// ===== PWA Install Logic =====
let deferredPrompt = null;

function permanentlyHideInstallButton() {
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'none'; // Changed from remove() to hide() to avoid null refs if checked again
}

// Initial Check
if (localStorage.getItem('partgo-installed') === 'true') {
    // We wait for DOM to be sure, but this runs early script
    // permanentlyHideInstallButton(); // DOM might not be ready
}

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();

    if (localStorage.getItem('partgo-installed') === 'true') {
        return;
    }

    // Stash the event so it can be triggered later.
    deferredPrompt = e;

    // Show the install button
    const btn = document.getElementById('install-btn');
    if (btn) btn.style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
    localStorage.setItem('partgo-installed', 'true');
    permanentlyHideInstallButton();
    console.log('PWA Installed');
});

// Bind click listener in DOMContentLoaded
const originalDOMListener = document.addEventListener('DOMContentLoaded', () => {
    // Already binding below, but let's add specific PWA binding here or merged below
});

// Main Tab Logic
window.showTab = function (tabId) {
    let tabPromise = null;
    document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
    const target = document.getElementById(tabId);
    if (!target) return;
    target.classList.add("active");

    document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.remove("active"));
    const navBtn = document.querySelector(`[data-tab="${tabId}"]`);
    if (navBtn) navBtn.classList.add("active");

    const loading = document.getElementById("loading");
    if (loading && tabId !== 'today') loading.style.display = "flex";

    switch (tabId) {
        case "parts":
            const pParts = !state.partsDataLoaded ? loadData() : Promise.resolve();
            const pImgParts = !state.imageDbLoaded ? import('./modules/parts.js').then(m => m.loadImageDatabase()) : Promise.resolve();
            Promise.all([pParts, pImgParts]).then(() => {
                applyFilters(); // Apply filters (which may have been synced)
                hideLoading();
            });
            break;
        case "images":
            const dp = !state.partsDataLoaded ? loadData() : Promise.resolve();
            const dip = !state.imageDbLoaded ? import('./modules/parts.js').then(m => m.loadImageDatabase()) : Promise.resolve();

            Promise.all([dp, dip]).then(() => {
                applyFiltersImages();
                hideLoading();
            });
            break;
        case "today":
            // Check if we have data loaded already
            if (state.todayDataLoaded) {
                // Optimistic render: Show existing data immediately
                updateTableToday();
                hideLoading();

                // Background fetch (silent) - Skip if saved recently (<15s) to avoid Google Sheets lag
                if (!state.lastSaveTime || (Date.now() - state.lastSaveTime > 15000)) {
                    loadTodayData({ silent: true }).then(() => hideLoading());
                }
            } else {
                // First time load: show full spinner
                loadTodayData({ silent: false }).then(() => hideLoading());
            }

            // Image DB loading (concurrent)
            if (!state.imageDbLoaded) {
                import('./modules/parts.js').then(m => m.loadImageDatabase());
            }
            break;
        case "pending-calls":
            loadPendingCallsData().then(() => hideLoading());
            break;
        case "all":
            loadAllData().then(() => hideLoading());
            break;
        default:
            hideLoading();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Global Exports
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.showSettings = showSettings;
window.showQRCode = showQRCode;
window.showHelp = showHelp;
window.handleClearCacheAndReload = handleClearCacheAndReload;
window.checkAuthForRequisition = checkAuthForRequisition;
window.showRequisitionDialog = showRequisitionDialog;
window.handleSwiperPrev = handleSwiperPrev;
window.handleSwiperNext = handleSwiperNext;
window.closeAllImageModals = closeAllImageModals;
window.openAnnouncementDeck = openAnnouncementDeck;
// Today Tab Exports
window.exportTodayData = exportTodayData;
window.saveTodayDataSnapshot = saveTodayDataSnapshot;
window.openAnnouncementEditor = openAnnouncementEditor;

import { logUserAction } from './api.js';
window.logUserAction = logUserAction;

// Search Sync Logic
function setupSearchSync() {
    const s1 = document.getElementById('searchInput1'); // Parts Master
    const s2 = document.getElementById('searchInput2');
    const img1 = document.getElementById('searchInputImages1'); // Images Master
    const img2 = document.getElementById('searchInputImages2');

    const sync = (source, target) => {
        if (source && target && source.value !== target.value) {
            target.value = source.value;
        }
    };

    if (s1 && img1) {
        s1.addEventListener('input', () => sync(s1, img1));
        img1.addEventListener('input', () => sync(img1, s1));
    }
    if (s2 && img2) {
        s2.addEventListener('input', () => sync(s2, img2));
        img2.addEventListener('input', () => sync(img2, s2));
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    checkLoginStatus(); // Will trigger auth-changed
    updateAppVersionDisplay();
    setupSearchSync(); // <--- Initialize Sync
    setupModalCloseHandlers(); // <--- Initialize Close Handlers

    // Bind search buttons
    const searchBtn = document.getElementById("searchButton");
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            document.getElementById("searchInput1").value = '';
            document.getElementById("searchInput2").value = '';
            // Also clear counterparts
            const img1 = document.getElementById("searchInputImages1");
            const img2 = document.getElementById("searchInputImages2");
            if (img1) img1.value = '';
            if (img2) img2.value = '';

            applyFilters();
        });
    }
    const searchInput1 = document.getElementById("searchInput1");
    if (searchInput1) searchInput1.addEventListener('input', debounce(applyFilters, 300));

    const searchInput2 = document.getElementById("searchInput2");
    if (searchInput2) searchInput2.addEventListener('input', debounce(applyFilters, 300));

    // Images tab search
    const searchBtnImg = document.getElementById("searchButtonImages");
    if (searchBtnImg) {
        searchBtnImg.addEventListener('click', () => {
            document.getElementById("searchInputImages1").value = '';
            document.getElementById("searchInputImages2").value = '';
            // Also clear counterparts
            const s1 = document.getElementById("searchInput1");
            const s2 = document.getElementById("searchInput2");
            if (s1) s1.value = '';
            if (s2) s2.value = '';

            applyFiltersImages();
        });
    }
    const searchInputImg1 = document.getElementById("searchInputImages1");
    if (searchInputImg1) searchInputImg1.addEventListener('input', debounce(applyFiltersImages, 300));

    const searchInputImg2 = document.getElementById("searchInputImages2");
    if (searchInputImg2) searchInputImg2.addEventListener('input', debounce(applyFiltersImages, 300));

    // Bind Today Admin Buttons
    const exportBtn = document.getElementById('exportTodayBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportTodayData);

    const saveTodayBtn = document.getElementById('saveTodayBtn');
    if (saveTodayBtn) saveTodayBtn.addEventListener('click', saveTodayDataSnapshot);

    // Initialize Today Tab Listeners (Search, Filter, Pagination)
    initTodayListeners();
    initPendingListeners();

    // Bind PWA Install Button
    const installBtn = document.getElementById('install-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                localStorage.setItem('partgo-installed', 'true');
                permanentlyHideInstallButton();
                Swal.fire({
                    icon: 'success',
                    title: 'ติดตั้งสำเร็จ!',
                    text: 'PartsGo ถูกเพิ่มในหน้าจอหลักแล้ว',
                    timer: 3000,
                    showConfirmButton: false
                });
            }
            deferredPrompt = null;
        });

        // Final check on load
        if (localStorage.getItem('partgo-installed') === 'true') {
            permanentlyHideInstallButton();
        }
    }
});

// Listen for auth changes
window.addEventListener('auth-changed', (e) => {
    // If logged in, maybe refresh data or UI
    console.log("Auth changed:", e.detail);

    // Force close settings modal on any auth change
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) settingsModal.style.display = 'none';

    if (e.detail.isLoggedIn) {
        document.getElementById('loginModal').classList.remove('active');
        document.getElementById('appContent').classList.add('logged-in');

        const userNameSmall = document.getElementById('userNameSmall');
        if (userNameSmall) userNameSmall.textContent = localStorage.getItem('userName') || '';

        // Show/Hide Admin Actions in Today Tab
        const adminActions = document.getElementById('todayAdminActions');
        if (adminActions) {
            if (e.detail.user && e.detail.user.auth === 'Admin') {
                adminActions.style.display = 'flex';
            } else {
                adminActions.style.display = 'none';
            }
        }

        const previousPlant = localStorage.getItem('loaded_stock_plant');
        const currentPlant = (localStorage.getItem('userPlant') || '').trim().replace(/\.0$/, '');
        const normalizedPlant = /^\d+$/.test(currentPlant) ? currentPlant.padStart(4, '0') : currentPlant;
        if (previousPlant !== null && previousPlant !== normalizedPlant) {
            state.partsDataLoaded = false;
        }
        window.showTab('parts');
    } else {
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.add('active');
        document.getElementById('appContent').classList.remove('logged-in');

        if (localStorage.getItem('versionUpdatedPrompt') === 'true') {
            const loginTitle = loginModal.querySelector('h2');
            if (loginTitle) {
                loginTitle.innerHTML = '<div style="color:#2ecc71; font-size:40px; margin-bottom:10px;"><i class="fas fa-check-circle"></i></div>อัปเดตแอปพลิเคชันสำเร็จ!<br><span style="font-size:16px; color:#7f8c8d; font-weight:normal; display:block; margin-top:8px;">กรุณาเข้าสู่ระบบใหม่อีกครั้งเพื่อใช้งานฟีเจอร์ล่าสุด</span>';
            }
            
            // Do NOT remove the flag immediately, otherwise the async SW registration might trigger the popup again.
            // Remove it after a few seconds or when user interacts.
            setTimeout(() => {
                localStorage.removeItem('versionUpdatedPrompt');
                sessionStorage.removeItem('updateInProgress');
            }, 5000);
        }
    }
});

// Listen for version update request
window.addEventListener('request-version-update', updateAppVersionDisplay);

// Global click to close modals
// Global click to close modals
window.addEventListener('click', (event) => {
    const settingsModal = document.getElementById('settingsModal');
    if (event.target === settingsModal) settingsModal.style.display = 'none';

    if (event.target.id === 'imageModal') {
        document.getElementById('imageModal').style.display = 'none';
        document.body.style.overflow = 'auto';
    }
    if (event.target.id === 'imageModalImages') {
        document.getElementById('imageModalImages').style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    // Generic modal close
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

function setupModalCloseHandlers() {
    const bindClose = (btnId, modalId) => {
        const btn = document.getElementById(btnId);
        const modal = document.getElementById(modalId);
        if (btn && modal) {
            btn.onclick = () => {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            };
        }
    };

    bindClose('closeSettings', 'settingsModal');
    bindClose('closeModal', 'detailModal');
    bindClose('closeModalAll', 'detailModalAll');
    bindClose('closeModalPending', 'detailModalPending');
    bindClose('closeImageModal', 'imageModal');
    bindClose('closeImageModalImages', 'imageModalImages');
}
