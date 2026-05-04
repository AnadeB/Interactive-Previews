// ─── Shared globals (used by all content scripts) ─────────────────────────────
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
        pdfScrollMode: 'pages',
        infoBar: {
            enabled: false,
            position: 'top',
            shownItems: ['dimensions', 'name', 'extension', 'fileSize', 'mimeType', 'aspectRatio'],
            hiddenItems: []
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
        console.error('[Interactive-Previews] Error loading settings:', chrome.runtime.lastError);
        return;
    }

    currentSettings = items;
    currentSettings.settings = { ...defaultSettings.settings, ...items.settings };
    currentSettings.settings.infoBar = {
        ...defaultSettings.settings.infoBar,
        ...(items.settings.infoBar || {})
    };
    currentSettings.settings.deepSearch = {
        ...defaultSettings.settings.deepSearch,
        ...(items.settings.deepSearch || {})
    };

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

    if (currentSettings.mode === 'blacklist') {
        return !(currentSettings.blacklist || []).some(p => {
            try { return new RegExp(p).test(domain) || new RegExp(p).test(currentUrl); }
            catch (e) { return false; }
        });
    }
    return (currentSettings.whitelist || []).some(p => {
        try { return new RegExp(p).test(domain) || new RegExp(p).test(currentUrl); }
        catch (e) { return false; }
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function init() {
    document.addEventListener('mouseover',  handleMouseOver);
    document.addEventListener('mouseout',   handleMouseOut);
    document.addEventListener('mousemove',  handleMouseMove);
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
    const modifier = currentSettings.settings.triggerModifier || 'none';
    if (modifier === 'shift' && !e.shiftKey) return;
    if (modifier === 'ctrl'  && !e.ctrlKey)  return;

    const src = findImageSrc(e.target);
    if (src) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        const delay = modifier === 'none' ? currentSettings.settings.delay : 0;
        const x = e.clientX, y = e.clientY;
        hoverTimeout = setTimeout(() => showPreview(src, x, y), delay);
    }
}

function handleMouseOut(e) {
    if (isPreviewTrigger(e.target)) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        if (isPdfMode) {
            // PDF: deferred hide — give cursor time to reach the preview container
            scheduleHide();
        } else {
            hidePreview();
        }
    }
}

function handleMouseMove(e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (!previewContainer || !previewContainer.classList.contains('visible')) return;

    const modifier = currentSettings.settings.triggerModifier || 'none';
    if (modifier === 'shift' && !e.shiftKey) { hidePreview(); return; }
    if (modifier === 'ctrl'  && !e.ctrlKey)  { hidePreview(); return; }

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
            if (!el || !isPreviewTrigger(el)) {
                hidePreview();
            }
        }
        // Do NOT call updatePosition — preview stays put
    } else {
        updatePosition(e.clientX, e.clientY);
    }
}

function handleKeyDown(e) {
    if (!isAllowedOnThisPage()) return;
    const modifier      = currentSettings.settings.triggerModifier || 'none';
    const isShiftTrigger = modifier === 'shift' && e.key === 'Shift';
    const isCtrlTrigger  = modifier === 'ctrl'  && (e.key === 'Control' || e.key === 'Meta');
    if (!isShiftTrigger && !isCtrlTrigger) return;
    if (previewContainer && previewContainer.classList.contains('visible')) return;

    const el  = document.elementFromPoint(lastMouseX, lastMouseY);
    if (!el) return;
    const src = findImageSrc(el);
    if (src) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        showPreview(src, lastMouseX, lastMouseY);
    }
}

function handleKeyUp(e) {
    const modifier      = currentSettings.settings.triggerModifier || 'none';
    const isShiftRelease = modifier === 'shift' && e.key === 'Shift';
    const isCtrlRelease  = modifier === 'ctrl'  && (e.key === 'Control' || e.key === 'Meta');
    if (isShiftRelease || isCtrlRelease) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hidePreview();
    }
}
