// Default settings fallback
const defaultSettings = {
    mode: 'blacklist',
    blacklist: [],
    whitelist: [],
    settings: {
        delay: 500,
        sizeMode: 'original',
        originalFitToScreen: true,
        customSize: 512
    }
};

let currentSettings = { ...defaultSettings };
let previewContainer = null;
let previewImg = null;
let hoverTimeout = null;

// Initialize
chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
        console.error('[Interactive-Previews] Error loading settings:', chrome.runtime.lastError);
        return;
    }

    currentSettings = items;
    console.log('[Interactive-Previews] Loaded settings:', currentSettings);

    const currentUrl = window.location.href;
    let domain = '';
    try { domain = new URL(currentUrl).hostname; } catch (e) { domain = ''; }

    let shouldRun = false;

    if (currentSettings.mode === 'blacklist') {
        const isBlacklisted = currentSettings.blacklist.some(pattern => {
            try {
                const regex = new RegExp(pattern);
                return regex.test(domain) || regex.test(currentUrl);
            } catch (e) {
                console.warn('[Interactive-Previews] Invalid regex:', pattern);
                return false;
            }
        });
        shouldRun = !isBlacklisted;
        console.log(`[Interactive-Previews] Mode: Blacklist. Blacklisted? ${isBlacklisted}. Run? ${shouldRun}`);
    } else {
        const isWhitelisted = currentSettings.whitelist.some(pattern => {
            try {
                const regex = new RegExp(pattern);
                return regex.test(domain) || regex.test(currentUrl);
            } catch (e) {
                console.warn('[Interactive-Previews] Invalid regex:', pattern);
                return false;
            }
        });
        shouldRun = isWhitelisted;
        console.log(`[Interactive-Previews] Mode: Whitelist. Whitelisted? ${isWhitelisted}. Run? ${shouldRun}`);
    }

    if (shouldRun) {
        console.log('[Interactive-Previews] Initializing...');
        init();

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync') {
                console.log('[Interactive-Previews] Settings changed:', changes);
                for (let key in changes) {
                    currentSettings[key] = changes[key].newValue;
                }
            }
        });
    } else {
        console.log('[Interactive-Previews] Disabled on this page.');
    }
});

function init() {
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousemove', handleMouseMove);
}

function createPreviewContainer() {
    if (previewContainer) return;

    console.log('[Interactive-Previews] Creating preview container.');
    previewContainer = document.createElement('div');
    previewContainer.id = 'interactive-preview-container';

    previewImg = document.createElement('img');
    previewContainer.appendChild(previewImg);
    document.body.appendChild(previewContainer);
}

function handleMouseOver(e) {
    const target = e.target;
    if (target.tagName === 'IMG') {
        const src = target.src || target.dataset.src;
        if (src) {
            console.log(`[Interactive-Previews] Hover: ${src}. Delay: ${currentSettings.settings.delay}ms`);
            if (hoverTimeout) clearTimeout(hoverTimeout);
            const x = e.clientX;
            const y = e.clientY;
            hoverTimeout = setTimeout(() => {
                showPreview(src, x, y);
            }, currentSettings.settings.delay);
        }
    }
}

function handleMouseOut(e) {
    if (e.target.tagName === 'IMG') {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hidePreview();
    }
}

function handleMouseMove(e) {
    if (previewContainer && previewContainer.classList.contains('visible')) {
        updatePosition(e.clientX, e.clientY);
    }
}

function showPreview(src, x, y) {
    console.log('[Interactive-Previews] Show preview:', src);
    createPreviewContainer();

    // Clean up previous handlers
    previewImg.onload = null;
    previewImg.onerror = null;

    // Reset inline styles so CSS doesn't conflict
    previewImg.style.width = '';
    previewImg.style.height = '';
    previewImg.style.maxWidth = '';
    previewImg.style.maxHeight = '';

    previewImg.onload = () => {
        console.log(`[Interactive-Previews] Loaded. Natural: ${previewImg.naturalWidth}x${previewImg.naturalHeight}`);
        applySizeSettings();
        previewContainer.classList.add('visible');
        updatePosition(x, y);
    };

    previewImg.onerror = () => {
        if (previewImg.src && previewImg.src !== '') {
            console.error('[Interactive-Previews] Failed to load:', src);
        }
    };

    previewImg.src = src;
}

function applySizeSettings() {
    const { sizeMode, originalFitToScreen, customSize } = currentSettings.settings;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 40;

    console.log(`[Interactive-Previews] Size mode: ${sizeMode}, Viewport: ${vw}x${vh}`);

    // Reset
    previewImg.style.width = '';
    previewImg.style.height = '';
    previewImg.style.maxWidth = '';
    previewImg.style.maxHeight = '';

    if (sizeMode === 'original') {
        if (originalFitToScreen) {
            previewImg.style.maxWidth = `${vw - pad}px`;
            previewImg.style.maxHeight = `${vh - pad}px`;
        }
        // else: no constraints, natural size
    } else if (sizeMode === 'viewport') {
        const nw = previewImg.naturalWidth || 1;
        const nh = previewImg.naturalHeight || 1;
        const imgRatio = nw / nh;
        const availW = vw - pad;
        const availH = vh - pad;

        if (availW / availH > imgRatio) {
            previewImg.style.height = `${availH}px`;
            previewImg.style.width = 'auto';
        } else {
            previewImg.style.width = `${availW}px`;
            previewImg.style.height = 'auto';
        }
    } else if (sizeMode === 'custom') {
        const max = customSize || 512;
        previewImg.style.maxWidth = `${max}px`;
        previewImg.style.maxHeight = `${max}px`;
    }
}

function hidePreview() {
    if (previewContainer) {
        previewContainer.classList.remove('visible');
        if (previewImg) {
            previewImg.onload = null;
            previewImg.onerror = null;
            previewImg.src = '';
        }
    }
}

function updatePosition(x, y) {
    if (!previewContainer) return;

    const offset = 20;
    const rect = previewContainer.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + offset;
    let top = y + offset;

    if (left + rect.width > vw) left = x - rect.width - offset;
    if (top + rect.height > vh) top = y - rect.height - offset;
    if (left < 10) left = 10;
    if (top < 10) top = 10;

    previewContainer.style.left = `${left}px`;
    previewContainer.style.top = `${top}px`;
}
