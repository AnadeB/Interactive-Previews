// ── info bar (used by both img and pdf previews) ────────────────────────────────

// maps item id → display string, returns null if no data for that item
// fileSize and mimeType are NOT here — those need async HEAD request, handled separately
function getInfoValue(itemId, nw, nh, fileName, fileExt, pageNum, numPages) {
    switch (itemId) {
        case 'dimensions':  return (nw && nh) ? `${nw}×${nh}` : null;
        case 'aspectRatio': if (nw && nh) { const g = gcd(nw, nh); return `${nw/g}:${nh/g}`; } return null;
        case 'name':        return fileName || null;
        case 'extension':   return fileExt  || null;
        case 'pageCount':   return (numPages && numPages >= 1) ? `Page ${pageNum} of ${numPages}` : null;
        default:            return null; // fileSize, mimeType — fetched async
    }
}

// stick infoBar before the main element (img or canvas), or after if pos=bottom
// anchorEl is whatever is the "content" of the preview
function positionInfoBar(anchorEl) {
    const ib = currentSettings.settings.infoBar || {};
    if (ib.position === 'bottom') {
        previewContainer.appendChild(infoBar);
    } else {
        // top = insert before the content element
        previewContainer.insertBefore(infoBar, anchorEl);
    }
}

// ── image info bar ──────────────────────────────────────────────────────────────

function updateInfoBar(src) {
    const ib = currentSettings.settings.infoBar || {};
    // if disabled just bail early
    if (!ib.enabled) { infoBar.style.display = 'none'; return; }

    positionInfoBar(previewImg);

    const shownItems = ib.shownItems || ['dimensions', 'name', 'extension', 'fileSize', 'mimeType', 'aspectRatio'];
    const nw = previewImg.naturalWidth;
    const nh = previewImg.naturalHeight;
    const { fileName, fileExt } = extractFileInfo(src);
    // check if we need to do the async HEAD fetch for size/mime
    const needsAsync = shownItems.includes('fileSize') || shownItems.includes('mimeType');

    // build sync parts first so bar shows up instantly without waiting for HEAD
    const syncParts = [];
    shownItems.forEach(id => {
        if (id === 'fileSize' || id === 'mimeType' || id === 'pageCount') return;
        const val = getInfoValue(id, nw, nh, fileName, fileExt, null, null);
        if (val) syncParts.push(val);
    });

    infoBar.textContent = syncParts.join(' · ');
    infoBar.style.display = (syncParts.length > 0 || needsAsync) ? 'block' : 'none';

    // kick off async fetch if we need size or mime type
    if (needsAsync) fetchImageMeta(src, shownItems, nw, nh, fileName, fileExt);
}

// HEAD request to grab Content-Length and Content-Type without downloading the whole file
function fetchImageMeta(src, shownItems, nw, nh, fileName, fileExt) {
    fetch(src, { method: 'HEAD', mode: 'cors' })
        .then(res => {
            const mime   = res.headers.get('Content-Type');
            const sizeHd = res.headers.get('Content-Length');
            const parts  = [];
            shownItems.forEach(id => {
                if (id === 'mimeType' && mime)   { parts.push(mime.split(';')[0].trim()); return; }
                if (id === 'fileSize' && sizeHd) { parts.push(formatFileSize(parseInt(sizeHd, 10))); return; }
                if (id === 'pageCount') return; // not applicable for images
                const val = getInfoValue(id, nw, nh, fileName, fileExt, null, null);
                if (val) parts.push(val);
            });
            // guard: infoBar might be gone by the time fetch resolves (user moved away)
            if (infoBar) {
                infoBar.textContent = parts.join(' · ');
                infoBar.style.display = parts.length > 0 ? 'block' : 'none';
                // reposition after content changed — size might have shifted the box
                updatePosition(
                    parseInt(previewContainer.style.left) || 0,
                    parseInt(previewContainer.style.top)  || 0
                );
            }
        })
        .catch(err => console.warn('[Interactive-Previews] HEAD failed:', err.message));
}

// ── pdf info bar ────────────────────────────────────────────────────────────────

function updatePdfInfoBar(url, pageNum, numPages) {
    const ib = currentSettings.settings.infoBar || {};
    if (!ib.enabled) { infoBar.style.display = 'none'; return; }

    // anchor to canvas for pdf (not img)
    positionInfoBar(previewCanvas);

    const { fileName, fileExt } = extractFileInfo(url);
    const shownItems = ib.shownItems || [];
    const parts = [];

    shownItems.forEach(id => {
        // dimensions/aspectRatio/fileSize/mimeType dont make sense for pdf in this context, skip em
        if (id === 'dimensions' || id === 'aspectRatio' || id === 'fileSize' || id === 'mimeType') return;

        if (id === 'extension') {
            // always show PDF label, not whatever the raw ext string is
            parts.push('PDF');
            return;
        }

        const val = getInfoValue(id, null, null, fileName, fileExt, pageNum, numPages);
        if (val) parts.push(val);
    });

    infoBar.textContent = parts.join(' · ');
    infoBar.style.display = parts.length > 0 ? 'block' : 'none';
}
