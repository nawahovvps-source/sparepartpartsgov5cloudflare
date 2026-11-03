export function setTheme(theme) {
    localStorage.setItem('theme', theme);
    document.body.classList.remove('dark-mode', 'light-mode');
    document.body.classList.add(theme + '-mode');
}

export function loadTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    setTheme(theme);
    if (document.getElementById('themeSelect')) {
        document.getElementById('themeSelect').value = theme;
    }
}
