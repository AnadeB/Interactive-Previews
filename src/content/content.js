// ── shared globals (all content scripts share this scope) ──────────────────────
const defaultSettings = {
    mode: 'blocklist',
    blocklist: [],
    allowlist: [],
    settings: {
        delay: 500,
        triggerModifiers: { shift: false, ctrl: false, alt: false },
        imageSizeMode: 'original',
        imageOriginalFitToScreen: true,
        imageCustomSize: 512,
        pdfSizeMode: 'viewport',
        pdfCustomSize: 512,
        pdfScrollMode: 'pages',
        infoBar: {
            enabled: false,
            position: 'top',
            shownItems: ['dimensions', 'name', 'extension', 'fileSize', 'mimeType', 'aspectRatio', 'pageCount'],
            hiddenItems: []
        },
        allowedFileTypes: {
            jpg: true, png: true, gif: true, webp: true, svg: true,
            avif: true, bmp: true, ico: true, tiff: true
        },
        deepSearch: {
            searchInside: true,
            cssBackgrounds: true,
            imageLinkHrefs: true
        },
        imagePreviewsEnabled: true,
        pdfPreviewsEnabled: true
    }
};

let currentSettings   = { ...defaultSettings };
let previewContainer  = null;  // the floating preview div injected into page
let previewImg        = null;  // <img> inside container for image previews
let previewCanvas     = null;  // <canvas> inside container for pdf previews
let infoBar           = null;  // info panel (shown on top or bottom of preview)
let hoverTimeout      = null;  // debounce timer — delays showing preview on hover
let hideTimer         = null;  // deferred hide for pdf mode (cursor needs time to reach preview)
let lastMouseX        = 0;     // track cursor pos so keydown handler can use it
let lastMouseY        = 0;
let isMouseDown       = false; // true while user is dragging (text selection) — dont hide during this

// ── boot ────────────────────────────────────────────────────────────────────────
// load settings from chrome.storage.sync before doing anything
chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
        console.error('[Interactive-Previews] Error loading settings:', chrome.runtime.lastError);
        return;
    }

    currentSettings = items;

    // merge nested settings so missing keys fall back to defaults
    currentSettings.settings = { ...defaultSettings.settings, ...items.settings };

    // deep merge nested objects so partial saves dont wipe unrelated keys
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

    console.log('[Interactive-Previews] Loaded settings:', currentSettings);

    // init pdfjs worker — has to be extension url, cant use cdn (csp blocks it)
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('src/pdfjs/pdf.worker.min.js');
        console.log('[Interactive-Previews] PDF.js ready.');
    }

    init();

    // listen for settings changes in real-time (e.g. user toggled something in options tab)
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (let key in changes) currentSettings[key] = changes[key].newValue;
        // if this page is now disabled (e.g. user added it to blocklist), hide immediately
        if (!isAllowedOnThisPage()) hidePreview();
    });
});

// ── permission check ─────────────────────────────────────────────────────────────

// returns false if extension is off or current url matches blocklist / not in allowlist
function isAllowedOnThisPage() {
    if (currentSettings.mode === 'off') return false;

    const currentUrl = window.location.href;
    let domain = '';
    try { domain = new URL(currentUrl).hostname; } catch (e) {}

    if (currentSettings.mode === 'blocklist') {
        // allowed unless current url matches any pattern in the blocklist
        return !(currentSettings.blocklist || []).some(p => {
            if (!p) return false;
            return domain.includes(p) || currentUrl.includes(p);
        });
    }
    // allowlist mode: only allowed if url matches something in the list
    return (currentSettings.allowlist || []).some(p => {
        if (!p) return false;
        return domain.includes(p) || currentUrl.includes(p);
    });
}

// ── document event listeners ─────────────────────────────────────────────────────
// passive:true for perf — we never call preventDefault in mouseover/out/move
document.addEventListener('mouseover', handleMouseOver, { passive: true });
document.addEventListener('mouseout', handleMouseOut, { passive: true });
document.addEventListener('mousemove', handleMouseMove, { passive: true });

document.addEventListener('mousedown', () => { isMouseDown = true; }, { passive: true });
document.addEventListener('mouseup', () => {
    isMouseDown = false;
    // after text selection drag ends: if cursor landed outside preview, hide it
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

// ── init ─────────────────────────────────────────────────────────────────────────

// separate from boot because we dont want key listeners until settings are loaded
function init() {
    document.addEventListener('keydown',    handleKeyDown);
    document.addEventListener('keyup',      handleKeyUp);
}

// ── container ─────────────────────────────────────────────────────────────────────

// creates the floating preview container once and appends to body
// subsequent calls are no-ops (idempotent)
function createPreviewContainer() {
    if (previewContainer) return;

    previewContainer = document.createElement('div');
    previewContainer.id = 'interactive-preview-container';

    infoBar = document.createElement('div');
    infoBar.id = 'interactive-preview-info';

    previewImg = document.createElement('img');

    previewCanvas = document.createElement('canvas');
    previewCanvas.id = 'interactive-preview-canvas';
    previewCanvas.style.display = 'none'; // hidden by default, only shown in pdf mode

    previewContainer.appendChild(infoBar);
    previewContainer.appendChild(previewImg);
    previewContainer.appendChild(previewCanvas);
    document.body.appendChild(previewContainer);
}

// ── preview dispatcher ────────────────────────────────────────────────────────────

// routes to image or pdf preview based on url type
function showPreview(src, x, y) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; } // cancel any pending hide
    if (isPdfUrl(src)) {
        showPdfPreview(src, x, y);
    } else {
        showImagePreview(src, x, y);
    }
}

// ── hide & position ───────────────────────────────────────────────────────────────

function hidePreview() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    cancelPdfTask();
    deactivatePdfScroll();

    if (previewContainer) {
        previewContainer.classList.remove('visible', 'pdf-loading', 'pdf-error');
        previewContainer.style.width = '';
        previewContainer.style.pointerEvents = ''; // reset so overlay doesnt block page interaction
    }
    if (previewImg) {
        // clear handlers and src to stop any in-flight img load
        previewImg.onload = null;
        previewImg.onerror = null;
        previewImg.src = '';
    }
    if (infoBar) {
        infoBar.textContent = '';
        infoBar.style.display = 'none';
    }
}

// deferred hide used in pdf mode — gives cursor time to travel from link to preview container
// if cursor reaches preview within 120ms, the hide is cancelled by handleMouseMove
function scheduleHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        hideTimer = null;
        // double-check: if cursor is over preview by now, keep showing
        if (previewContainer && previewContainer.classList.contains('visible') && isPdfMode) {
            const r = previewContainer.getBoundingClientRect();
            if (lastMouseX >= r.left && lastMouseX <= r.right &&
                lastMouseY >= r.top  && lastMouseY <= r.bottom) return;
        }
        hidePreview();
    }, 120); // 120ms feels right — not too slow, not too snappy
}

// position preview near cursor, flip to opposite side if it would overflow viewport
function updatePosition(x, y) {
    if (!previewContainer) return;
    // pdf stays put (user needs to scroll it), img follows cursor with offset so cursor doesnt cover content
    const offset = isPdfMode ? 0 : 20;
    const rect   = previewContainer.getBoundingClientRect();
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;

    let left = x + offset;
    let top  = y + offset;
    // flip if overflowing right or bottom
    if (left + rect.width  > vw) left = x - rect.width  - offset;
    if (top  + rect.height > vh) top  = y - rect.height - offset;
    // clamp to min 10px from edges
    if (left < 10) left = 10;
    if (top  < 10) top  = 10;

    previewContainer.style.left = `${left}px`;
    previewContainer.style.top  = `${top}px`;
}

// ── event handlers ────────────────────────────────────────────────────────────────

function handleMouseOver(e) {
    if (!isAllowedOnThisPage()) return;
    const mods = currentSettings.settings.triggerModifiers || { shift: false, ctrl: false, alt: false };

    // if modifiers are configured, check they're held — dont show preview otherwise
    if (mods.shift && !e.shiftKey) return;
    if (mods.ctrl && !e.ctrlKey && !e.metaKey) return;
    if (mods.alt && !e.altKey) return;

    const src = findImageSrc(e.target, e.clientX, e.clientY);
    if (src) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        // with no modifier required: use delay (prevents accidental hover spam)
        // with modifier: delay is 0 — user explicitly triggered, show instantly
        const noModsRequired = !mods.shift && !mods.ctrl && !mods.alt;
        const delay = noModsRequired ? currentSettings.settings.delay : 0;
        const x = e.clientX, y = e.clientY;
        hoverTimeout = setTimeout(() => showPreview(src, x, y), delay);
    }
}

function handleMouseOut(e) {
    if (isPreviewTrigger(e.target)) {
        if (hoverTimeout) clearTimeout(hoverTimeout); // cancel pending show
        if (isPdfMode) {
            // pdf: dont hide instantly — user needs time to move cursor onto the preview itself
            // but dont schedule hide if they're in the middle of text selection
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

    // if preview hasnt shown yet but timer is running: cancel if cursor left the trigger area
    if (hoverTimeout && !isVisible) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || !isPreviewTrigger(el, e.clientX, e.clientY)) {
            clearTimeout(hoverTimeout);
            hoverTimeout = null;
        }
    }

    if (!isVisible) return;

    // if modifier was released while preview is showing, hide immediately
    const mods = currentSettings.settings.triggerModifiers || { shift: false, ctrl: false, alt: false };
    if (mods.shift && !e.shiftKey) { hidePreview(); return; }
    if (mods.ctrl && !e.ctrlKey && !e.metaKey) { hidePreview(); return; }
    if (mods.alt && !e.altKey) { hidePreview(); return; }

    if (isPdfMode) {
        // pdf preview is LOCKED IN PLACE — doesnt follow cursor
        const r = previewContainer.getBoundingClientRect();
        const overPreview = e.clientX >= r.left && e.clientX <= r.right &&
                            e.clientY >= r.top  && e.clientY <= r.bottom;

        if (overPreview) {
            // cursor is on the preview box — cancel any scheduled hide
            if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        } else {
            // cursor left preview area — hide unless its still over a trigger element
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el || !isPreviewTrigger(el, e.clientX, e.clientY)) {
                if (!isMouseDown) hidePreview(); // dont hide during text selection drag
            }
        }
        // no position update for pdf — it stays where it opened
    } else {
        // image mode: follow cursor, hide if cursor left the trigger element
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

    // figure out which keys are pressed (including the one being pressed right now)
    const shiftPressed = e.key === 'Shift' || e.shiftKey;
    const ctrlPressed = e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey;
    const altPressed = e.key === 'Alt' || e.altKey;

    // all required modifiers must be satisfied
    if (mods.shift && !shiftPressed) return;
    if (mods.ctrl && !ctrlPressed) return;
    if (mods.alt && !altPressed) return;

    // dont trigger keydown if no modifiers are configured — mouseover handles that case
    const noModsRequired = !mods.shift && !mods.ctrl && !mods.alt;
    if (noModsRequired) return;

    if (previewContainer && previewContainer.classList.contains('visible')) return; // already showing

    // show preview for whatever element is under cursor right now
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
    // check if one of the required modifier keys was just released
    const isShiftRelease = mods.shift && e.key === 'Shift';
    const isCtrlRelease  = mods.ctrl && (e.key === 'Control' || e.key === 'Meta');
    const isAltRelease   = mods.alt && e.key === 'Alt';

    // if a required key was released, hide the preview immediately
    if (isShiftRelease || isCtrlRelease || isAltRelease) {
        if (hoverTimeout) clearTimeout(hoverTimeout);
        hidePreview();
    }
}
