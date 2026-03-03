// Default settings fallback
const defaultSettings = {
    mode: 'blacklist',
    blacklist: [],
    whitelist: [],
    settings: {
        delay: 500,
        triggerModifier: 'none',
        sizeMode: 'original',
        originalFitToScreen: true,
        customSize: 512,
        infoBar: {
            enabled: false,
            position: 'top',
            shownItems: ['dimensions', 'name', 'extension', 'fileSize', 'mimeType', 'aspectRatio'],
            hiddenItems: []
        },
        deepSearch: {
            searchInside: true,
            cssBackgrounds: true
        }
    }
};

let currentSettings = { ...defaultSettings };
let previewContainer = null;
let previewImg = null;
let infoBar = null;
let hoverTimeout = null;
let lastMouseX = 0;
let lastMouseY = 0;

// Initialize — always attach listeners, check permission dynamically
chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
        console.error('[Interactive-Previews] Error loading settings:', chrome.runtime.lastError);
        return;
    }

    currentSettings = items;
    // Merge nested defaults
    currentSettings.settings = { ...defaultSettings.settings, ...items.settings };
    currentSettings.settings.infoBar = { ...defaultSettings.settings.infoBar, ...(items.settings.infoBar || {}) };
    currentSettings.settings.deepSearch = { ...defaultSettings.settings.deepSearch, ...(items.settings.deepSearch || {}) };

    console.log('[Interactive-Previews] Loaded settings:', currentSettings);

    // Always initialize listeners
    init();

    // Always listen for storage changes so mode switches apply instantly
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync') {
            console.log('[Interactive-Previews] Settings changed:', changes);
            for (let key in changes) {
                currentSettings[key] = changes[key].newValue;
            }
            // If extension just became disallowed, hide any active preview
            if (!isAllowedOnThisPage()) {
                hidePreview();
            }
        }
    });
});

/**
 * Check if the extension should be active on the current page,
 * evaluated in real-time against current settings.
 */
function isAllowedOnThisPage() {
    if (currentSettings.mode === 'off') return false;

    const currentUrl = window.location.href;
    let domain = '';
    try { domain = new URL(currentUrl).hostname; } catch (e) { domain = ''; }

    if (currentSettings.mode === 'blacklist') {
        const isBlacklisted = (currentSettings.blacklist || []).some(pattern => {
            try {
                const regex = new RegExp(pattern);
                return regex.test(domain) || regex.test(currentUrl);
            } catch (e) { return false; }
        });
        return !isBlacklisted;
    } else {
        const isWhitelisted = (currentSettings.whitelist || []).some(pattern => {
            try {
                const regex = new RegExp(pattern);
                return regex.test(domain) || regex.test(currentUrl);
            } catch (e) { return false; }
        });
        return isWhitelisted;
    }
}

function init() {
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
}

function createPreviewContainer() {
    if (previewContainer) return;

    console.log('[Interactive-Previews] Creating preview container.');
    previewContainer = document.createElement('div');
    previewContainer.id = 'interactive-preview-container';

    // Info bar element
    infoBar = document.createElement('div');
    infoBar.id = 'interactive-preview-info';

    previewImg = document.createElement('img');

    // Append in order — will be rearranged based on position setting
    previewContainer.appendChild(infoBar);
    previewContainer.appendChild(previewImg);

    document.body.appendChild(previewContainer);
}

/**
 * Find the best image source from the hovered element.
 * Handles: direct <img>, child <img> inside containers, CSS background-image.
 */
function findImageSrc(target) {
    // 1. Direct <img> tag
    if (target.tagName === 'IMG') {
        return target.src || target.dataset.src || null;
    }

    const ds = currentSettings.settings.deepSearch || {};

    // 2. Search inside container elements for a child <img>
    if (ds.searchInside !== false) {
        const childImg = target.querySelector('img');
        if (childImg) {
            const src = childImg.src || childImg.dataset.src;
            if (src) return src;
        }
    }

    // 3. CSS background-image
    if (ds.cssBackgrounds !== false) {
        const bgImage = getComputedStyle(target).backgroundImage;
        if (bgImage && bgImage !== 'none') {
            const match = bgImage.match(/url\(["']?(.*?)["']?\)/);
            if (match && match[1]) {
                return match[1];
            }
        }
    }

    return null;
}

/**
 * Determine if we should hide preview when mouse leaves this element.
 * Needs to handle the same types of elements findImageSrc handles.
 */
function isPreviewTrigger(target) {
    if (target.tagName === 'IMG') return true;

    const ds = currentSettings.settings.deepSearch || {};

    if (ds.searchInside !== false && target.querySelector('img')) return true;

    if (ds.cssBackgrounds !== false) {
        const bgImage = getComputedStyle(target).backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) return true;
    }

    return false;
}

function handleMouseOver(e) {
    // Dynamic permission check — reacts to mode changes instantly
    if (!isAllowedOnThisPage()) return;

    const target = e.target;

    // Check trigger modifier key
    const modifier = currentSettings.settings.triggerModifier || 'none';
    if (modifier === 'shift' && !e.shiftKey) return;
    if (modifier === 'ctrl' && !e.ctrlKey) return;

    const src = findImageSrc(target);
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

function handleMouseOut(e) {
    if (isPreviewTrigger(e.target)) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hidePreview();
    }
}

function handleMouseMove(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (previewContainer && previewContainer.classList.contains('visible')) {
        // Re-check modifier key if required
        const modifier = currentSettings.settings.triggerModifier || 'none';
        if (modifier === 'shift' && !e.shiftKey) { hidePreview(); return; }
        if (modifier === 'ctrl' && !e.ctrlKey) { hidePreview(); return; }

        updatePosition(e.clientX, e.clientY);
    }
}

function handleKeyDown(e) {
    if (!isAllowedOnThisPage()) return;
    const modifier = currentSettings.settings.triggerModifier || 'none';
    const isShiftTrigger = modifier === 'shift' && e.key === 'Shift';
    const isCtrlTrigger = modifier === 'ctrl' && (e.key === 'Control' || e.key === 'Meta');
    if (!isShiftTrigger && !isCtrlTrigger) return;

    // Preview already visible — nothing to do
    if (previewContainer && previewContainer.classList.contains('visible')) return;

    // Check if there is an image element under the current cursor position
    const el = document.elementFromPoint(lastMouseX, lastMouseY);
    if (!el) return;
    const src = findImageSrc(el);
    if (src) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hoverTimeout = setTimeout(() => showPreview(src, lastMouseX, lastMouseY), currentSettings.settings.delay);
    }
}

function handleKeyUp(e) {
    const modifier = currentSettings.settings.triggerModifier || 'none';
    const isShiftRelease = modifier === 'shift' && e.key === 'Shift';
    const isCtrlRelease = modifier === 'ctrl' && (e.key === 'Control' || e.key === 'Meta');
    if (isShiftRelease || isCtrlRelease) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hidePreview();
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

    // Reset info bar
    infoBar.textContent = '';
    infoBar.style.display = 'none';

    previewImg.onload = () => {
        console.log(`[Interactive-Previews] Loaded. Natural: ${previewImg.naturalWidth}x${previewImg.naturalHeight}`);
        applySizeSettings();
        updateInfoBar(src);
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
        // Strict aspect-ratio: longest side = customSize
        const max = customSize || 512;
        const nw = previewImg.naturalWidth || 1;
        const nh = previewImg.naturalHeight || 1;
        if (nw >= nh) {
            previewImg.style.width = `${max}px`;
            previewImg.style.height = 'auto';
        } else {
            previewImg.style.height = `${max}px`;
            previewImg.style.width = 'auto';
        }
    }
}

/**
 * Extract file name and extension from an image URL
 */
function extractFileInfo(src) {
    let fileName = '';
    let fileExt = '';
    try {
        const urlObj = new URL(src);
        const pathParts = urlObj.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart) {
            fileName = decodeURIComponent(lastPart);
            const dotIdx = fileName.lastIndexOf('.');
            if (dotIdx > 0) {
                fileExt = fileName.substring(dotIdx + 1).toUpperCase();
            }
        }
    } catch (e) {
        const clean = src.split('?')[0].split('#')[0];
        const parts2 = clean.split('/');
        fileName = parts2[parts2.length - 1] || '';
        const dotIdx = fileName.lastIndexOf('.');
        if (dotIdx > 0) fileExt = fileName.substring(dotIdx + 1).toUpperCase();
    }
    return { fileName, fileExt };
}

/**
 * Get the value for an info bar item (sync items only)
 */
function getInfoValue(itemId, nw, nh, fileName, fileExt) {
    switch (itemId) {
        case 'dimensions': return `${nw}×${nh}`;
        case 'aspectRatio':
            if (nw && nh) { const g = gcd(nw, nh); return `${nw / g}:${nh / g}`; }
            return null;
        case 'name': return fileName || null;
        case 'extension': return fileExt || null;
        default: return null; // fileSize, mimeType handled async
    }
}

/**
 * Populate the info bar with image metadata, respecting shownItems order
 */
function updateInfoBar(src) {
    const ib = currentSettings.settings.infoBar || {};
    if (!ib.enabled) {
        infoBar.style.display = 'none';
        return;
    }

    // Arrange position: top or bottom
    if (ib.position === 'bottom') {
        previewContainer.appendChild(infoBar);
    } else {
        previewContainer.insertBefore(infoBar, previewImg);
    }

    const shownItems = ib.shownItems || ['dimensions', 'name', 'extension', 'fileSize', 'mimeType', 'aspectRatio'];
    const nw = previewImg.naturalWidth;
    const nh = previewImg.naturalHeight;
    const { fileName, fileExt } = extractFileInfo(src);

    // Build sync parts in order, leave placeholders for async items
    const needsAsync = shownItems.includes('fileSize') || shownItems.includes('mimeType');

    // Build parts in order
    const syncParts = [];
    shownItems.forEach(id => {
        if (id === 'fileSize' || id === 'mimeType') return; // skip async
        const val = getInfoValue(id, nw, nh, fileName, fileExt);
        if (val) syncParts.push(val);
    });

    infoBar.textContent = syncParts.join(' · ');
    infoBar.style.display = syncParts.length > 0 || needsAsync ? 'block' : 'none';

    if (needsAsync) {
        fetchImageMeta(src, shownItems, syncParts, nw, nh, fileName, fileExt);
    }
}

/**
 * Issue a HEAD request to get Content-Length and Content-Type,
 * then rebuild the info bar respecting shownItems order
 */
function fetchImageMeta(src, shownItems, syncPartsIgnored, nw, nh, fileName, fileExt) {
    fetch(src, { method: 'HEAD', mode: 'cors' })
        .then(response => {
            const mime = response.headers.get('Content-Type');
            const sizeHeader = response.headers.get('Content-Length');

            // Rebuild all parts in shownItems order, now with async data
            const allParts = [];
            shownItems.forEach(id => {
                if (id === 'mimeType' && mime) {
                    allParts.push(mime.split(';')[0].trim());
                } else if (id === 'fileSize' && sizeHeader) {
                    allParts.push(formatFileSize(parseInt(sizeHeader, 10)));
                } else {
                    const val = getInfoValue(id, nw, nh, fileName, fileExt);
                    if (val) allParts.push(val);
                }
            });

            if (infoBar) {
                infoBar.textContent = allParts.join(' · ');
                infoBar.style.display = allParts.length > 0 ? 'block' : 'none';
                updatePosition(
                    parseInt(previewContainer.style.left) || 0,
                    parseInt(previewContainer.style.top) || 0
                );
            }
        })
        .catch(err => {
            console.warn('[Interactive-Previews] HEAD request failed:', err.message);
        });
}

/**
 * Format bytes into human-readable size
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

/**
 * Greatest common divisor for aspect ratio calculation
 */
function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

function hidePreview() {
    if (previewContainer) {
        previewContainer.classList.remove('visible');
        if (previewImg) {
            previewImg.onload = null;
            previewImg.onerror = null;
            previewImg.src = '';
        }
        if (infoBar) {
            infoBar.textContent = '';
            infoBar.style.display = 'none';
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
