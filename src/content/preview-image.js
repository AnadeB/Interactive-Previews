// ── image preview ──────────────────────────────────────────────────────────────

function showImagePreview(src, x, y) {
    console.log('[Interactive-Previews] Show image preview:', src);
    createPreviewContainer();
    // kill any leftover pdf state just in case
    cancelPdfTask();
    deactivatePdfScroll();

    // switch to img mode — show img tag, hide canvas
    previewImg.style.display = '';
    previewCanvas.style.display = 'none';
    previewContainer.classList.remove('pdf-loading', 'pdf-error');

    // reset everything before loading new src, avoid flicker from prev img
    previewImg.onload = null;
    previewImg.onerror = null;
    previewContainer.style.width = '';
    previewImg.style.width = '';
    previewImg.style.height = '';
    previewImg.style.maxWidth = '';
    previewImg.style.maxHeight = '';
    infoBar.textContent = '';
    infoBar.style.display = 'none';

    previewImg.onload = () => {
        console.log(`[Interactive-Previews] Loaded. Natural: ${previewImg.naturalWidth}x${previewImg.naturalHeight}`);
        applySizeSettings();
        updateInfoBar(src);
        previewContainer.classList.add('visible');
        // sync container width to img width so box doesnt overflow
        const w = previewImg.offsetWidth;
        if (w > 0) previewContainer.style.width = w + 'px';
        updatePosition(x, y);
    };

    previewImg.onerror = () => {
        // guard: dont log if src was cleared intentionally (happens on hidePreview)
        if (previewImg.src && previewImg.src !== '') {
            console.error('[Interactive-Previews] Failed to load:', src);
        }
    };

    previewImg.src = src;
}

// applies size mode from settings to the img element
// called after onload so naturalWidth/Height are available
function applySizeSettings() {
    const { imageSizeMode: sizeMode, imageOriginalFitToScreen: originalFitToScreen, imageCustomSize: customSize } = currentSettings.settings;
    const vw = window.innerWidth, vh = window.innerHeight, pad = 40;

    // reset first so prev settings dont leak
    previewImg.style.width = '';
    previewImg.style.height = '';
    previewImg.style.maxWidth = '';
    previewImg.style.maxHeight = '';

    if (sizeMode === 'original') {
        // show at 1:1 but clamp to screen if user wants that
        if (originalFitToScreen) {
            previewImg.style.maxWidth  = `${vw - pad}px`;
            previewImg.style.maxHeight = `${vh - pad}px`;
        }
    } else if (sizeMode === 'viewport') {
        // fit to whole viewport, preserve aspect ratio
        const nw = previewImg.naturalWidth  || 1;
        const nh = previewImg.naturalHeight || 1;
        // figure out which axis is the bottleneck
        if ((vw - pad) / (vh - pad) > nw / nh) {
            previewImg.style.height = `${vh - pad}px`;
            previewImg.style.width  = 'auto';
        } else {
            previewImg.style.width  = `${vw - pad}px`;
            previewImg.style.height = 'auto';
        }
    } else if (sizeMode === 'custom') {
        // user set a fixed px size — fit longest side to that val
        const max = customSize || 512;
        const nw  = previewImg.naturalWidth  || 1;
        const nh  = previewImg.naturalHeight || 1;
        if (nw >= nh) {
            previewImg.style.width  = `${max}px`;
            previewImg.style.height = 'auto';
        } else {
            previewImg.style.height = `${max}px`;
            previewImg.style.width  = 'auto';
        }
    }
}
