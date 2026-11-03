export const CONFIG = {
    CACHE_VERSION: "v18",
    get CACHE_NAME() { return `partgo-cache-${this.CACHE_VERSION}`; },
    DATA_CACHE_PREFIX: 'partgo-cache-',
    DATA_CACHE_VERSION_KEY: 'dataCacheVersion',

    // API Endpoints
    ENDPOINTS: {
        REQUEST_SHEET_BASE: '/api/request',
        GAS: '/api/gas',
        MAIN_SAP: '/api/main-sap', // Parts tab
        IMAGES: '/api/image-db', // Images tab
        PENDING_CALLS: '/api/pending',
        STOCK: '/api/stock',
        BORROW_STOCK: '/api/borrow-stock'
    }
};
