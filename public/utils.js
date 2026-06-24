export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

export function escapeHTML(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function sanitizeIconName(icon, fallback = 'folder') {
    return typeof icon === 'string' && /^[a-z0-9-]{1,48}$/.test(icon)
        ? icon
        : fallback;
}

export function getFaviconUrl(url) {
    try {
        const urlObj = new URL(url);
        // 使用多个favicon服务以提高可靠性
        return `https://www.google.com/s2/favicons?sz=64&domain=${urlObj.hostname}`;
    } catch (e) {
        return '';
    }
}

// 备用favicon获取方法
export function getFaviconUrlAlt(url) {
    try {
        const urlObj = new URL(url);
        // 使用FaviconKit服务作为备选
        return `https://api.faviconkit.com/${urlObj.hostname}/64`;
    } catch (e) {
        return '';
    }
}

export function formatDate(timestamp) {
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(new Date(timestamp));
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
