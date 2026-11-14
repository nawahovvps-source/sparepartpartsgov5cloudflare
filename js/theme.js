export function setTheme(theme) {
    localStorage.setItem('theme', theme);
    document.body.classList.remove('dark-mode', 'light-mode');
    document.body.classList.add(theme + '-mode');
}

export function loadTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    setTheme(theme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.checked = theme === 'dark';
    const themeModeLabel = document.getElementById('themeModeLabel');
    if (themeModeLabel) themeModeLabel.textContent = theme === 'dark' ? 'มืด' : 'สว่าง';
}
