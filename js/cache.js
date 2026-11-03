import { CONFIG } from './config.js';

export async function clearDataCaches() {
    try {
        const keys = await caches.keys();
        const targets = keys.filter(name => name.startsWith(CONFIG.DATA_CACHE_PREFIX));
        await Promise.all(targets.map(name => caches.delete(name)));
        console.log('ล้าง cache ข้อมูลเสร็จสิ้น:', targets);
    } catch (err) {
        console.warn('ล้าง cache ข้อมูลไม่สำเร็จ', err);
    }
}

export async function ensureCacheFreshForVersion(version) {
    if (!version) return;
    const storedVersion = localStorage.getItem(CONFIG.DATA_CACHE_VERSION_KEY);
    if (storedVersion === version) return;
    await clearDataCaches();
    localStorage.setItem(CONFIG.DATA_CACHE_VERSION_KEY, version);
}

export async function getCachedData(key, fetchFn, expireHours = 1) {
    try {
        const cache = await caches.open(CONFIG.CACHE_NAME);
        const cached = await cache.match(key);
        if (cached) {
            const { data, timestamp } = await cached.json();
            const ageHours = (Date.now() - timestamp) / (1000 * 60 * 60);
            if (ageHours < expireHours) {
                console.log("ใช้ Cache:", key);
                return data;
            }
        }
    } catch (e) {
        console.warn("Cache API ไม่พร้อม (อาจเปิดใน http หรือบางเบราว์เซอร์)", e);
    }

    console.log("ดึงข้อมูลใหม่จากเซิร์ฟเวอร์:", key);
    const freshData = await fetchFn();

    // ✅ บันทึกข้อมูล + timestamp ลง Cache
    try {
        const cache = await caches.open(CONFIG.CACHE_NAME);
        await cache.put(
            key,
            new Response(
                JSON.stringify({
                    data: freshData,
                    timestamp: Date.now()
                })
            )
        );
    } catch (e) {
        // ถ้าบันทึก cache ไม่ได้ (เช่น พื้นที่เต็ม) → ไม่ error
    }

    return freshData;
}

export async function handleClearCacheAndReload() {
    try {
        Swal.fire({
            title: 'กำลังล้างแคช...',
            text: 'โปรดรอสักครู่',
            allowOutsideClick: false,
            allowEscapeKey: false,
            didOpen: () => Swal.showLoading()
        });
        const keys = await caches.keys();
        await Promise.all(keys.map(name => caches.delete(name)));
        localStorage.removeItem(CONFIG.DATA_CACHE_VERSION_KEY);
        Swal.fire({
            icon: 'success',
            title: 'ล้างแคชแล้ว',
            text: 'กำลังรีโหลดข้อมูลใหม่',
            timer: 1200,
            showConfirmButton: false
        });
    } catch (err) {
        console.error('ล้างแคชไม่สำเร็จ:', err);
        Swal.fire({
            icon: 'error',
            title: 'ล้างแคชไม่สำเร็จ',
            text: 'จะรีโหลดเพื่อพยายามใหม่',
            timer: 1200,
            showConfirmButton: false
        });
    } finally {
        setTimeout(() => window.location.reload(true), 1300);
    }
}
