export const apiFetch = async (input, init = {}) => {
    const options = { ...init };
    if (!options.credentials) {
        options.credentials = 'same-origin';
    }

    const requestUrl = new URL(input instanceof Request ? input.url : input, window.location.href);
    if (requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith('/api/')) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(options.headers).forEach((value, name) => headers.set(name, value));
        headers.set('X-Requested-With', 'XMLHttpRequest');
        options.headers = headers;
    }

    const response = await fetch(input, options);

    if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth-session-expired'));
    }

    return response;
};

// URL ของ Apps Script ตัวใหม่ที่ใช้สำหรับเก็บ Log (รอเปลี่ยนหลังจาก Deploy เป็น Web App)
const LOG_API_URL = "https://script.google.com/macros/s/AKfycbzYFBH9v3CTeniDRceRxjQVGPwwyF6zDhAYXQ2K_590H1GE3AAF0xoWtycEKSPeqy6tzA/exec"; 

export const logUserAction = (action, details = '') => {
    try {
        if (!LOG_API_URL || LOG_API_URL.includes("YOUR_NEW_LOGGING_SCRIPT_ID")) {
            console.log("Log [Local]:", action, details);
            return;
        }

        const username = localStorage.getItem('username') || 'Unknown';
        const name = localStorage.getItem('userName') || 'Unknown';

        const payload = {
            username: username,
            name: name,
            action: action,
            details: typeof details === 'object' ? JSON.stringify(details) : details
        };

        fetch(LOG_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: `payload=${encodeURIComponent(JSON.stringify(payload))}`
        }).catch(err => console.error("Logging failed:", err));
    } catch(e) {
        console.error("Logging error", e);
    }
};
