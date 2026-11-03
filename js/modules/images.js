import { state } from '../state.js';
import { hideLoading, showDetailModal, renderPagination } from '../ui.js';
import { getStorageBinValue, debounce, parseSafeFloat } from '../utils.js';

// --- Rate Limited Loader Implementation ---
let imageQueue = [];
let isProcessingQueue = false;

// Process the queue with a delay to respect rate limits
function processImageQueue() {
    if (imageQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }
    isProcessingQueue = true;

    const img = imageQueue.shift();
    if (img) {
        // Trigger the load
        img.src = img.dataset.src;
        img.onload = () => {
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-loaded');
        };
        img.onerror = () => {
            img.classList.remove('lazy-loading');
            img.classList.add('lazy-error');
            // Optionally set a fallback image
            // img.src = 'path/to/error-image.jpg'; 
        }

        // Wait 50ms before processing the next image
        // 50ms = ~20 images per second, much faster but still throttled
        setTimeout(processImageQueue, 50);
    } else {
        processImageQueue();
    }
}

// Observer to add visible images to the queue
const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            // Only add if it has a data-src and hasn't been handled yet
            if (img.dataset.src && !img.src.includes(img.dataset.src)) {
                imageQueue.push(img);
                // Stop observing once added to queue
                imageObserver.unobserve(img);

                // Start processing if not already running
                if (!isProcessingQueue) {
                    processImageQueue();
                }
            }
        }
    });
}, {
    rootMargin: '100px 0px', // Preload images slightly before they scroll into view
    threshold: 0.01
});

// Helper to reset/clear queue effectively if needed (e.g., on tab switch or new search)
export function resetImageQueue() {
    // Clear the array to stop pending loads for old results
    imageQueue = [];
    isProcessingQueue = false;
}

export function applyFiltersImages() {
    const searchInput1 = document.getElementById("searchInputImages1");
    const searchInput2 = document.getElementById("searchInputImages2");

    // Use part data as base, but filter for those that have images?
    // Actually main.js logic: "allDataImages" seems to serve separate purpose?
    // Reading main.js line 254: let allDataImages = [];
    // But showTab('images') says: "ไม่โหลดข้อมูลใหม่ → ใช้ allData เดิม" if no specific load.
    // Actually logic seems to use state.allData (from parts) + images db.

    // Let's assume we use state.allData from parts if available.
    if (!state.allData || state.allData.length === 0) {
        console.warn('applyFiltersImages: state.allData is empty', state.allData);
        // Must load data if not loaded
        // This should be handled by app.js router
    }

    const query1 = searchInput1 ? searchInput1.value.toLowerCase().trim() : '';
    const query2 = searchInput2 ? searchInput2.value.toLowerCase().trim() : '';

    console.log('applyFiltersImages: Start filtering', {
        totalData: state.allData ? state.allData.length : 0,
        imageDbSize: state.imageDatabase ? Object.keys(state.imageDatabase).length : 0,
        query1,
        query2
    });

    if (!state.allData) state.allData = [];

    // OPTIMIZATION: Check if _searchString exists (from parts.js)
    // If not, fall back to calculating on the fly (but slower)
    state.currentFilteredDataImages = state.allData.filter(row => {
        const mat = (row.Material || "").toString().trim();
        // Check if image exists
        const hasImgInDb = state.imageDatabase[mat] && state.imageDatabase[mat].length > 0;
        const hasUrlWeb = row.UrlWeb && row.UrlWeb.length > 10; // simple check

        if (!hasImgInDb && !hasUrlWeb) return false;

        let match1, match2;
        if (row._searchString) {
            // Fast path
            match1 = !query1 || row._searchString.includes(query1);
            match2 = !query2 || row._searchString.includes(query2);
        } else {
            // Slow path (fallback)
            const desc = (row.Description || "").toString().toLowerCase();
            const spec = (row.OCRTAXT || "").toString().toLowerCase();
            const bin = getStorageBinValue(row).toLowerCase();
            // We skip building fullText if not needed, just search values
            match1 = !query1 || Object.values(row).some(v => String(v).toLowerCase().includes(query1));
            match2 = !query2 || Object.values(row).some(v => String(v).toLowerCase().includes(query2));
        }
        return match1 && match2;
    });

    console.log('applyFiltersImages: End filtering', {
        filteredCount: state.currentFilteredDataImages.length
    });

    state.currentPageImages = 1;
    renderGallery();

    // Fix: Pass itemsPerPage and prefix 'Images' correctly
    const itemsPerPageSelect = document.getElementById("itemsPerPageImages");
    const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;
    renderPagination(
        state.currentFilteredDataImages.length,
        state.currentPageImages,
        'pageNumbersImages',
        itemsPerPage,
        'Images'
    );
}

export function renderGallery() {
    const galleryContainer = document.getElementById("gallery-container-images");
    if (!galleryContainer) return;

    // Clear previous queue to prevent ghost loads
    resetImageQueue();

    galleryContainer.innerHTML = "";

    const itemsPerPageSelect = document.getElementById("itemsPerPageImages");
    const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;

    const start = (state.currentPageImages - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageData = state.currentFilteredDataImages.slice(start, end);

    const fragment = document.createDocumentFragment();

    pageData.forEach(row => {
        const mat = (row.Material || "").toString().trim();
        let finalUrl = '';
        let imgId = null;

        // Image Selection Logic from main.js
        if (state.imageDatabase[mat] && state.imageDatabase[mat].length > 0) {
            imgId = state.imageDatabase[mat][0];
        } else if (row.UrlWeb) {
            // main.js: extractIdFromUrlWeb fallback
            const match = row.UrlWeb.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
                row.UrlWeb.match(/id=([a-zA-Z0-9-_]+)/) ||
                row.UrlWeb.match(/uc\?id=([a-zA-Z0-9-_]+)/);
            if (match && match[1]) imgId = match[1];
        }

        if (imgId) {
            finalUrl = `https://drive.google.com/thumbnail?id=${imgId}&sz=s300`;
        } else {
            // Fallback SVG if no image
            finalUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'%3E%3Crect width='100%25' height='100%25' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%23999' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";
        }

        // Styling Logic from main.js
        const vibhavadiValue = parseSafeFloat(row["วิภาวดี"]);
        const unrestrictedValue = parseSafeFloat(row["Unrestricted"]);
        let textColor = "";
        let fontWeight = "";
        if (vibhavadiValue > 0) {
            textColor = "#4caf50"; // Green
            fontWeight = "bold";
        } else if (vibhavadiValue === 0 && unrestrictedValue > 0) {
            textColor = "#2196f3"; // Blue
            fontWeight = "bold";
        }

        const card = document.createElement('div');
        card.className = 'gallery-item';

        card.innerHTML = `
            <img 
                class="gallery-thumbnail lazy-loading"
                src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3C/svg%3E" 
                data-src="${finalUrl}" 
                alt="${mat}"
                referrerpolicy="no-referrer"
                style="color: ${textColor}; font-weight: ${fontWeight};"
            >
            <div class="gallery-info">
                <div class="gallery-material" style="color: ${textColor}; font-weight: ${fontWeight}; font-size: 18px;">${mat}</div>
                <div class="gallery-description">${row.Description || '-'}</div>
            </div>
        `;

        card.onclick = () => showDetailModal(row, 'imageModalImages', 'imageModalContentImages');
        fragment.appendChild(card); // Append to fragment
    });

    galleryContainer.appendChild(fragment); // Single append to DOM

    // Observe after appending to DOM
    const cards = galleryContainer.querySelectorAll('.gallery-item');
    cards.forEach(card => {
        const imgEl = card.querySelector('img');
        if (imgEl) imageObserver.observe(imgEl);
    }); // End forEach

    // Use Fragment for single repaint if we were appending to fragment
    // But here we appended to galleryContainer directly in loop? 
    // Wait, the original code appended to galleryContainer in loop: galleryContainer.appendChild(card);
    // Let's optimize to use Fragment.

}

export function changePageImages(page) {
    state.currentPageImages = page;
    renderGallery();
    const itemsPerPageSelect = document.getElementById("itemsPerPageImages");
    const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;
    renderPagination(state.currentFilteredDataImages.length, state.currentPageImages, 'pageNumbersImages', itemsPerPage, 'Images');
}

// Sync Logic for Search Inputs (Images <-> Parts)
setTimeout(() => {
    const imgS1 = document.getElementById('searchInputImages1');
    const imgS2 = document.getElementById('searchInputImages2');

    // Initialize from state if available
    if (imgS1 && state.search1) imgS1.value = state.search1;
    if (imgS2 && state.search2) imgS2.value = state.search2;

    if (imgS1) {
        imgS1.addEventListener('input', debounce((e) => {
            state.search1 = e.target.value;
            const s1 = document.getElementById('searchInput1');
            if (s1) s1.value = state.search1;
            applyFiltersImages();
        }, 300));
    }

    if (imgS2) {
        imgS2.addEventListener('input', debounce((e) => {
            state.search2 = e.target.value;
            const s2 = document.getElementById('searchInput2');
            if (s2) s2.value = state.search2;
            applyFiltersImages();
        }, 300));
    }

    // Pagination Listeners Images
    const prev = document.getElementById("prevPageImages");
    const next = document.getElementById("nextPageImages");
    const first = document.getElementById("firstPageImages");
    const last = document.getElementById("lastPageImages");

    if (prev) prev.onclick = () => changePageImages(state.currentPageImages - 1);
    if (next) next.onclick = () => changePageImages(state.currentPageImages + 1);
    if (first) first.onclick = () => changePageImages(1);
    if (last) last.onclick = () => {
        const itemsPerPageSelect = document.getElementById("itemsPerPageImages");
        const itemsPerPage = itemsPerPageSelect ? parseInt(itemsPerPageSelect.value, 10) : 20;
        const total = Math.ceil(state.currentFilteredDataImages.length / itemsPerPage);
        changePageImages(total);
    };

    // Items Per Page Change
    const itemsSelect = document.getElementById("itemsPerPageImages");
    if (itemsSelect) {
        itemsSelect.onchange = () => {
            state.currentPageImages = 1;
            renderGallery();
            import('../ui.js').then(ui => ui.renderPagination(state.currentFilteredDataImages.length, state.currentPageImages, 'pageNumbersImages', parseInt(itemsSelect.value, 10), 'Images'));
        };
    }
}, 0);
