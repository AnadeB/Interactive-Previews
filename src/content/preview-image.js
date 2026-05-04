// ─── Image preview ────────────────────────────────────────────────────────────

function showImagePreview(src, x, y) {
    console.log('[Interactive-Previews] Show image preview:', src);
    createPreviewContainer();
    cancelPdfTask();
    deactivatePdfScroll();

    // Switch to image mode
    previewImg.style.display = '';
    previewCanvas.style.display = 'none';
    previewContainer.classList.remove('pdf-loading', 'pdf-error');

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
        const w = previewImg.offsetWidth;
        if (w > 0) previewContainer.style.width = w + 'px';
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
    const vw = window.innerWidth, vh = window.innerHeight, pad = 40;

    previewImg.style.width = '';
    previewImg.style.height = '';
    previewImg.style.maxWidth = '';
    previewImg.style.maxHeight = '';

    if (sizeMode === 'original') {
        if (originalFitToScreen) {
            previewImg.style.maxWidth  = `${vw - pad}px`;
            previewImg.style.maxHeight = `${vh - pad}px`;
        }
    } else if (sizeMode === 'viewport') {
        const nw = previewImg.naturalWidth  || 1;
        const nh = previewImg.naturalHeight || 1;
        if ((vw - pad) / (vh - pad) > nw / nh) {
            previewImg.style.height = `${vh - pad}px`;
            previewImg.style.width  = 'auto';
        } else {
            previewImg.style.width  = `${vw - pad}px`;
            previewImg.style.height = 'auto';
        }
    } else if (sizeMode === 'custom') {
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
