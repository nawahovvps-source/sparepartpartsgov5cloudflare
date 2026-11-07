import { apiFetch, logUserAction } from './api.js';
import { state } from './state.js';

export let employeeDataPromise = null;

export async function loadEmployeeData({ forceRefresh = false } = {}) {
    // Case 1: Data already loaded
    if (!forceRefresh && state.employeeDataLoaded && state.employeeData.length > 0) {
        return state.employeeData;
    }

    // Case 2: Fetch already in progress
    if (employeeDataPromise) {
        return employeeDataPromise;
    }

    // Case 3: Fetch new data
    const employeeUrl = '/api/employee';
    employeeDataPromise = apiFetch(employeeUrl)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            state.employeeData = data;
            state.employeeDataLoaded = true;

            employeeDataPromise = null;
            return data;
        })
        .catch(err => {
            employeeDataPromise = null;
            throw err;
        });
    return employeeDataPromise;
}

export function checkLoginStatus() {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    if (isLoggedIn) {
        const user = {
            name: localStorage.getItem('userName'),
            auth: localStorage.getItem('userAuth')
        };
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { isLoggedIn: true, user } }));
        loadEmployeeData()
            .then(employees => {
                const username = localStorage.getItem('username');
                const employee = employees.find(item => String(item.IDRec || '').trim() === String(username || '').trim());
                if (employee) {
                    localStorage.setItem('userTeam', employee.หน่วยงาน || '');
                    localStorage.setItem('userPlant', employee.Plant || '');
                }
            })
            .catch(() => {});
        // Log when user opens app and is already logged in
        logUserAction('APP_OPEN', `User ${user.name || localStorage.getItem('username')} opened the app.`);
    } else {
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { isLoggedIn: false } }));
    }
}

export async function handleLogin() {
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('loginError');
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const loginButton = document.querySelector('#loginModal button[type="submit"]');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    loginError.style.display = 'none';

    if (!username || !password) {
        loginError.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
        loginError.style.display = 'block';
        return;
    }

    // UI Feedback: Loading State
    const originalButtonText = loginButton ? loginButton.innerHTML : 'เข้าสู่ระบบ';
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';
        loginButton.style.opacity = '0.7';
        loginButton.style.cursor = 'not-allowed';
    }

    try {
        const response = await apiFetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            let errorMsg = `HTTP ${response.status}`;
            try {
                const errJson = await response.json();
                if (errJson.error) errorMsg += `: ${errJson.error}`;
            } catch (e) { }
            throw new Error(errorMsg);
        }

        const result = await response.json();
        if (!result || result.status !== 'success' || !result.user) {
            throw new Error('Invalid response');
        }

        const user = result.user;
        console.log('Login result:', result);
        console.log('User from API:', user);

        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('username', username);
        localStorage.setItem('userName', user.name || username);
        localStorage.setItem('userAuth', user.auth || 'None');
        localStorage.setItem('userPlant', user.plant || '');
        localStorage.setItem('userTeam', user.team || '');

        console.log('LocalStorage set:', {
            username: localStorage.getItem('username'),
            userName: localStorage.getItem('userName')
        });

        if (rememberMeCheckbox.checked) {
            localStorage.setItem('savedUsername', username);
            localStorage.setItem('rememberMe', 'true');
        } else {
            localStorage.removeItem('savedUsername');
            localStorage.removeItem('rememberMe');
        }

        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { isLoggedIn: true, user } }));

        logUserAction('LOGIN', `User ${user.name || username} logged in successfully`);

        return true;

    } catch (error) {
        let message = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ กรุณาลองใหม่';
        if (error.message && error.message.includes('401')) {
            message = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง!';
        } else if (error.message && (error.message.includes('Missing env') || error.message.includes('Upstream'))) {
            message = 'ระบบขัดข้อง (Server Config Error)';
        }
        loginError.textContent = message;
        loginError.style.display = 'block';
        passwordInput.value = '';
        console.error('Login error:', error);
        return false;
    } finally {
        // Restore Button State
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = originalButtonText;
            loginButton.style.opacity = '1';
            loginButton.style.cursor = 'pointer';
        }
    }
}

import { clearDataCaches } from './cache.js';

export function handleLogout() {
    apiFetch('/api/logout', { method: 'POST' }).catch(() => { });
    logUserAction('LOGOUT', 'User logged out');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('username');
    localStorage.removeItem('userName');
    localStorage.removeItem('userAuth');
    localStorage.removeItem('userPlant');
    localStorage.removeItem('userTeam');
    localStorage.removeItem('savedUsername');
    localStorage.removeItem('savedPassword');
    localStorage.removeItem('rememberMe');

    // Reset Global State to prevent stale data
    state.employeeData = [];
    state.employeeDataLoaded = false;
    state.borrowData = [];
    state.borrowDataLoaded = false;
    state.borrowDataError = null;
    state.employeePhones = {};
    employeeDataPromise = null;

    // Clear Service Worker Cache for Data
    clearDataCaches().then(() => {
        console.log('User cache cleared on logout');
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { isLoggedIn: false } }));
    });
}

export function checkAuthForRequisition() {
    const userPlant = localStorage.getItem('userPlant') || 'None';
    const savedUsername = localStorage.getItem('username');
    const userAuth = localStorage.getItem('userAuth') || 'None';
    // Fix: Allow if admin (7512411) OR (Active Auth AND (Plant is valid OR Empty/None for Vibhavadi))
    const hasPermission = savedUsername === '7512411' || (userAuth !== 'None');

    if (hasPermission) return true;

    Swal.fire({
        icon: 'warning',
        title: 'Rank คุณยังไม่ถึงเกณฑ์!',
        html: `
      <div style="text-align:center; padding:10px;">
        <i class="fas fa-lock" style="font-size:60px; color:#f39c12; margin-bottom:15px;"></i>
        <p style="font-size:18px; font-weight:bold; color:#e67e22;">คุณไม่มีสิทธิ์ในการเบิกอะไหล่</p>
        <p style="color:#7f8c8d; margin-top:10px;">กรุณาติดต่อ Admin เพื่อสอบถามสิทธิ์</p>
        <div style="margin-top:20px; padding:15px; background:#fff3cd; border-radius:10px; border-left:5px solid #f39c12;">
          <p style="margin:0; font-size:14px; color:#856404;">
            <i class="fas fa-info-circle"></i> 
            ผู้ใช้ทั่วไปสามารถค้นหาข้อมูลได้เท่านั้น
          </p>
        </div>
      </div>
    `,
        confirmButtonText: 'ตกลง',
        confirmButtonColor: '#f39c12',
        width: window.innerWidth <= 480 ? '90%' : '500px'
    });
    return false;
}

// Global Auth Event Listeners
window.addEventListener('auth-session-expired', () => {
    console.warn('Session expired. Logging out...');
    handleLogout();

    Swal.fire({
        icon: 'warning',
        title: 'Session Expired',
        text: 'เซสชันของคุณหมดอายุ กรุณาเข้าสู่ระบบใหม่',
        confirmButtonText: 'ตกลง',
        allowOutsideClick: false,
        allowEscapeKey: false
    }).then(() => {
        // Optional: Redirect to login or open login modal if needed
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.click();
    });
});
