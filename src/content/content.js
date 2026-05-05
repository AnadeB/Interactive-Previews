// ─── Shared globals (used by all content scripts) ─────────────────────────────
const defaultSettings = {
    mode: 'blocklist',
    blocklist: [],
    allowlist: [],
    settings: {
        delay: 500,
        triggerModifiers: { shift: false, ctrl: false, alt: false },
        sizeMode: 'original',
        originalFitToScreen: true,
        customSize: 512,
        pdfScrollMode: 'pages',
        infoBar: {
            enabled: false,
            position: 'top',
            shownItems: ['dimensions', 'name', 'extension', 'fileSize', 'mimeType', 'aspectRatio', 'pageCount'],
            hiddenItems: []
        },
        allowedFileTypes: {
            jpg: true, png: true, gif: true, webp: true, svg: true,
            avif: true, bmp: true, ico: true, tiff: true, pdf: true
        },
        deepSearch: {
            searchInside: true,
            cssBackgrounds: true,
            imageLinkHrefs: true,
            pdfEnabled: true
        }
    }
};

let currentSettings   = { ...defaultSettings };
let previewContainer  = null;
let previewImg        = null;
let previewCanvas     = null;
let infoBar           = null;
let hoverTimeout      = null;
let hideTimer         = null;  // deferred hide for PDF mode
let lastMouseX        = 0;
let lastMouseY        = 0;
let isMouseDown       = false; // track selection drag state

// ─── Boot ─────────────────────────────────────────────────────────────────────
chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
        console.error('[Interactive-Previews] Error loading settings:', chrome.runtime.lastError);
        return;
    }

    // Migration from old settings
    let loadedMode = items.mode;
    let loadedBlocklist = items.blocklist || [];
    let loadedAllowlist = items.allowlist || [];
    if (items.mode === 'blacklist') {
        loadedMode = 'blocklist';
        loadedBlocklist = items.blacklist || items.blocklist || [];
    } else if (items.mode === 'whitelist') {
        loadedMode = 'allowlist';
        loadedAllowlist = items.whitelist || items.allowlist || [];
    }

    currentSettings = items;
    currentSettings.mode = loadedMode;
    currentSettings.blocklist = loadedBlocklist;
    currentSettings.allowlist = loadedAllowlist;
    
    currentSettings.settings = { ...defaultSettings.settings, ...items.settings };
    
    // Migrate triggerModifier
    if (currentSettings.settings.triggerModifier && typeof currentSettings.settings.triggerModifier === 'string') {
        currentSettings.settings.triggerModifiers = { shift: false, ctrl: false, alt: false };
        if (currentSettings.settings.triggerModifier === 'shift') currentSettings.settings.triggerModifiers.shift = true;
        if (currentSettings.settings.triggerModifier === 'ctrl') currentSettings.settings.triggerModifiers.ctrl = true;
        delete currentSettings.settings.triggerModifier;
    }

    currentSettings.settings.infoBar = {
        ...defaultSettings.settings.infoBar,
        ...(items.settings?.infoBar || {})
    };
    currentSettings.settings.allowedFileTypes = {
        ...defaultSettings.settings.allowedFileTypes,
        ...(items.settings?.allowedFileTypes || {})
    };
    currentSettings.settings.deepSearch = {
        ...defaultSettings.settings.deepSearch,
        ...(items.settings?.deepSearch || {})
    };

    // Migrate missing Info Bar items (e.g. pageCount for existing users)
    const ib = currentSettings.settings.infoBar;
    const allKnown = defaultSettings.settings.infoBar.shownItems;
    const allPresent = [...(ib.shownItems || []), ...(ib.hiddenItems || [])];
    allKnown.forEach(id => {
        if (!allPresent.includes(id)) {
            if (!ib.shownItems) ib.shownItems = [];
            ib.shownItems.push(id);
        }
    });

    console.log('[Interactive-Previews] Loaded settings:', currentSettings);

    // Initialize PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('src/pdfjs/pdf.worker.min.js');
        console.log('[Interactive-Previews] PDF.js ready.');
    }

    init();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (let key in changes) currentSettings[key] = changes[key].newValue;
        if (!isAllowedOnThisPage()) hidePreview();
    });
});

// ─── Permission check ─────────────────────────────────────────────────────────
function isAllowedOnThisPage() {
    if (currentSettings.mode === 'off') return false;

    const currentUrl = window.location.href;
    let domain = '';
    try { domain = new URL(currentUrl).hostname; } catch (e) {}

    if (currentSettings.mode === 'blocklist') {
        return !(currentSettings.blocklist || []).some(p => {
            if (!p) return false;
            return domain.includes(p) || currentUrl.includes(p);
        });
    }
    return (currentSettings.allowlist || []).some(p => {
        if (!p) return false;
        return domain.includes(p) || currentUrl.includes(p);
    });
}

// ─── Document event listeners ───────────────────────────────────────────────────
document.addEventListener('mouseover', handleMouseOver, { passive: true });
document.addEventListener('mouseout', handleMouseOut, { passive: true });
document.addEventListener('mousemove', handleMouseMove, { passive: true });

document.addEventListener('mousedown', () => { isMouseDown = true; }, { passive: true });
document.addEventListener('mouseup', () => { 
    isMouseDown = false; 
    // If cursor ended up outside preview and trigger after selection, hide it
    if (isPdfMode && previewContainer && previewContainer.classList.contains('visible')) {
        const r = previewContainer.getBoundingClientRect();
        const overPreview = lastMouseX >= r.left && lastMouseX <= r.right &&
                            lastMouseY >= r.top  && lastMouseY <= r.bottom;
        if (!overPreview) {
            const el = document.elementFromPoint(lastMouseX, lastMouseY);
            if (!el || !isPreviewTrigger(el)) hidePreview();
        }
    }
}, { passive: true });

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
    document.addEventListener('keydown',    handleKeyDown);
    document.addEventListener('keyup',      handleKeyUp);
}

// ─── Container ────────────────────────────────────────────────────────────────
function createPreviewContainer() {
    if (previewContainer) return;

    previewContainer = document.createElement('div');
    previewContainer.id = 'interactive-preview-container';

    infoBar = document.createElement('div');
    infoBar.id = 'interactive-preview-info';

    previewImg = document.createElement('img');

    previewCanvas = document.createElement('canvas');
    previewCanvas.id = 'interactive-preview-canvas';
    previewCanvas.style.display = 'none';

    previewContainer.appendChild(infoBar);
    previewContainer.appendChild(previewImg);
    previewContainer.appendChild(previewCanvas);
    document.body.appendChild(previewContainer);
}

// ─── Preview dispatcher ───────────────────────────────────────────────────────
function showPreview(src, x, y) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (isPdfUrl(src)) {
        showPdfPreview(src, x, y);
    } else {
        showImagePreview(src, x, y);
    }
}

// ─── Hide & position ──────────────────────────────────────────────────────────
function hidePreview() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    cancelPdfTask();
    deactivatePdfScroll();

    if (previewContainer) {
        previewContainer.classList.remove('visible', 'pdf-loading', 'pdf-error');
        previewContainer.style.width = '';
        previewContainer.style.pointerEvents = '';
    }
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

/**
 * Schedule a hide with a short delay.
 * Used in PDF mode so cursor has time to reach the preview container.
 * If cursor lands on preview bounds, the hide is cancelled by handleMouseMove.
 */
function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        hideTimer = null;
        // If cursor ended up over preview — keep showing
        if (previewContainer && previewContainer.classList.contains('visible') && isPdfMode) {
            const r = previewContainer.getBoundingClientRect();
            if (lastMouseX >= r.left && lastMouseX <= r.right &&
                lastMouseY >= r.top  && lastMouseY <= r.bottom) return;
        }
        hidePreview();
    }, 120);
}

function updatePosition(x, y) {
    if (!previewContainer) return;
    // For PDF, we want the preview EXACTLY under the mouse so the user can scroll instantly
    // For images, we keep the 20px offset so the cursor doesn't block the image
    const offset = isPdfMode ? 0 : 20;
    const rect   = previewContainer.getBoundingClientRect();
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;

    let left = x + offset;
    let top  = y + offset;
    if (left + rect.width  > vw) left = x - rect.width  - offset;
    if (top  + rect.height > vh) top  = y - rect.height - offset;
    if (left < 10) left = 10;
    if (top  < 10) top  = 10;

    previewContainer.style.left = `${left}px`;
    previewContainer.style.top  = `${top}px`;
}

// ─── Event handlers ───────────────────────────────────────────────────────────
function handleMouseOver(e) {
    if (!isAllowedOnThisPage()) return;
    const mods = currentSettings.settings.triggerModifiers || { shift: false, ctrl: false, alt: false };
    
    if (mods.shift && !e.shiftKey) return;
    if (mods.ctrl && !e.ctrlKey && !e.metaKey) return;
    if (mods.alt && !e.altKey) return;

    const src = findImageSrc(e.target, e.clientX, e.clientY);
    if (src) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        // If NO modifiers are required, use delay. If any modifier is required, delay is 0.
        const noModsRequired = !mods.shift && !mods.ctrl && !mods.alt;
        const delay = noModsRequired ? currentSettings.settings.delay : 0;
        const x = e.clientX, y = e.clientY;
        hoverTimeout = setTimeout(() => showPreview(src, x, y), delay);
    }
}

function handleMouseOut(e) {
    if (isPreviewTrigger(e.target)) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        if (isPdfMode) {
            // PDF: deferred hide — give cursor time to reach the preview container
            // Don't hide if user is actively dragging to select text
            if (!isMouseDown) scheduleHide();
        } else {
            hidePreview();
        }
    }
}

function handleMouseMove(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const isVisible = previewContainer && previewContainer.classList.contains('visible');

    // If waiting for delay to show preview, check if we moved off the trigger
    if (hoverTimeout && !isVisible) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || !isPreviewTrigger(el, e.clientX, e.clientY)) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
    }

    if (!isVisible) return;

    const mods = currentSettings.settings.triggerModifiers || { shift: false, ctrl: false, alt: false };
    if (mods.shift && !e.shiftKey) { hidePreview(); return; }
    if (mods.ctrl && !e.ctrlKey && !e.metaKey) { hidePreview(); return; }
    if (mods.alt && !e.altKey) { hidePreview(); return; }

    if (isPdfMode) {
        // PDF preview is LOCKED — does not follow cursor
        const r = previewContainer.getBoundingClientRect();
        const overPreview = e.clientX >= r.left && e.clientX <= r.right &&
                            e.clientY >= r.top  && e.clientY <= r.bottom;

        if (overPreview) {
            // Cursor is on preview — cancel any scheduled hide
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        } else {
            // Cursor left preview — hide only if also not over a trigger element
            // elementFromPoint ignores pointer-events:none, so it sees what's "behind" preview
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el || !isPreviewTrigger(el, e.clientX, e.clientY)) {
                // Don't hide if user is actively dragging to select text
                if (!isMouseDown) hidePreview();
            }
        }
        // Do NOT call updatePosition — preview stays put
    } else {
        // For Image mode, instantly hide if cursor moved off the trigger bounds
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || !isPreviewTrigger(el, e.clientX, e.clientY)) {
            hidePreview();
        } else {
            updatePosition(e.clientX, e.clientY);
        }
    }
}

function handleKeyDown(e) {
    if (!isAllowedOnThisPage()) return;
    const mods = currentSettings.settings.triggerModifiers || { shift: false, ctrl: false, alt: false };
    
    // Check if ALL required modifiers are currently pressed (or about to be pressed by this event)
    const shiftPressed = e.key === 'Shift' || e.shiftKey;
    const ctrlPressed = e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey;
    const altPressed = e.key === 'Alt' || e.altKey;
    
    if (mods.shift && !shiftPressed) return;
    if (mods.ctrl && !ctrlPressed) return;
    if (mods.alt && !altPressed) return;
    
    // Only trigger if at least one modifier was required and was just pressed
    const noModsRequired = !mods.shift && !mods.ctrl && !mods.alt;
    if (noModsRequired) return; 

    if (previewContainer && previewContainer.classList.contains('visible')) return;

    const el  = document.elementFromPoint(lastMouseX, lastMouseY);
    if (!el) return;
    const src = findImageSrc(el, lastMouseX, lastMouseY);
    if (src) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        showPreview(src, lastMouseX, lastMouseY);
    }
}

function handleKeyUp(e) {
    const mods = currentSettings.settings.triggerModifiers || { shift: false, ctrl: false, alt: false };
    const isShiftRelease = mods.shift && e.key === 'Shift';
    const isCtrlRelease  = mods.ctrl && (e.key === 'Control' || e.key === 'Meta');
    const isAltRelease   = mods.alt && e.key === 'Alt';
    
    if (isShiftRelease || isCtrlRelease || isAltRelease) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hidePreview();
    }
}
