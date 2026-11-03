export function debounce(func, wait = 100) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

export function extractIdFromUrlWeb(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/) ||
        url.match(/id=([a-zA-Z0-9-_]+)/) ||
        url.match(/uc\?id=([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

export function getStorageBinValue(row) {
    if (row["Storage bin"]) return row["Storage bin"];
    if (row["Storage Bin"]) return row["Storage Bin"];
    if (row["storage bin"]) return row["storage bin"];
    return "";
}

export function isAdminUser() {
    return localStorage.getItem('userAuth') === 'Admin';
}

export function parseDateTimeToJSDate(dateTimeStr) {
    if (!dateTimeStr || typeof dateTimeStr !== 'string') return null;
    const match = dateTimeStr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, day, month, year, hour, minute, second] = match;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10) - 1;
    const y = parseInt(year, 10);
    if (y < 2000 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return null;
    return new Date(y, m, d, parseInt(hour, 10), parseInt(minute, 10), parseInt(second, 10));
}

export function formatDateTimeToThai(dateTimeStr) {
    const dateObj = parseDateTimeToJSDate(dateTimeStr);
    if (!dateObj) return "ไม่ระบุวันที่";
    const d = dateObj.getDate();
    const m = dateObj.getMonth() + 1;
    const yBE = dateObj.getFullYear() + 543;
    const h = dateObj.getHours().toString().padStart(2, '0');
    const min = dateObj.getMinutes().toString().padStart(2, '0');
    const sec = dateObj.getSeconds().toString().padStart(2, '0');
    const months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${d} ${months[m]} ${yBE}, ${h}:${min}:${sec}`;
}

export function sortByColumn(a, b, column, direction) {
    let valueA = a[column];
    let valueB = b[column];

    if (valueA === undefined || valueA === null) valueA = "";
    if (valueB === undefined || valueB === null) valueB = "";

    // Force "temp_" IDs (pending rows) to be considered largest for ID sorting
    if (column === 'IDRow' || column === 'idRow' || column === 'row_id') {
        const isATemp = String(valueA).startsWith('temp_');
        const isBTemp = String(valueB).startsWith('temp_');

        if (isATemp && !isBTemp) return direction === 'asc' ? 1 : -1; // Temp > Real
        if (!isATemp && isBTemp) return direction === 'asc' ? -1 : 1; // Real < Temp
        if (isATemp && isBTemp) return 0; // Maintain relative order
    }

    if (column === 'IDRow' || column === 'Timestamp') {
        const parseDateOrId = (value) => {
            if (!value) return 0;
            const strVal = String(value);
            if (column === 'IDRow') {
                return parseInt(strVal, 10) || 0;
            }
            // Timestamp loose parsing
            const [datePart, timePart] = strVal.split(' ');
            if (!datePart) return 0;
            const parts = datePart.split('/');
            if (parts.length < 3) return 0;
            const month = parseInt(parts[0]) - 1;
            const day = parseInt(parts[1]);
            const year = parseInt(parts[2]);
            if (!timePart) return new Date(year, month, day).getTime();
            const [hour, minute, second] = timePart.split(':').map(Number);
            return new Date(year, month, day, hour || 0, minute || 0, second || 0).getTime();
        };
        const numA = parseDateOrId(valueA);
        const numB = parseDateOrId(valueB);
        return direction === 'asc' ? numA - numB : numB - numA;
    } else {
        if (String(valueA).trim() !== "" && String(valueB).trim() !== "") {
            const nA = parseSafeFloat(valueA);
            const nB = parseSafeFloat(valueB);
            
            // Check if both were actually numeric (non-zero or explicitly "0")
            // parseSafeFloat returns 0 for non-numeric strings, so we need careful check if we want to skip non-numeric
            // But usually if it's a numeric column it's fine.
            // Let's stick to simple parsing.
            if (!isNaN(nA) && !isNaN(nB)) {
                return direction === 'asc' ? nA - nB : nB - nA;
            }
        }
        valueA = String(valueA).toLowerCase();
        valueB = String(valueB).toLowerCase();
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
    }
}

export function parseSafeFloat(val) {
    if (val === undefined || val === null || val === "") return 0;
    const str = val.toString().replace(/,/g, '');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : num;
}
