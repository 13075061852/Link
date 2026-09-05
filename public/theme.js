const THEME_KEY = 'nexus_theme_preference';

export class ThemeManager {
    constructor() {
        this.init();
    }

    init() {
        let savedTheme;
        try { savedTheme = localStorage.getItem(THEME_KEY); } catch (_) {}
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    toggle() {
        const isDark = document.documentElement.classList.toggle('dark');
        try { localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light'); } catch (_) {}
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#10141d' : '#f5f7fb');
        return isDark;
    }

    isDark() {
        return document.documentElement.classList.contains('dark');
    }
}
