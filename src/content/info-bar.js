// ─── Info bar (shared for images and PDFs) ────────────────────────────────────

function getInfoValue(itemId, nw, nh, fileName, fileExt, pageNum, numPages) {
    switch (itemId) {
        case 'dimensions':  return (nw && nh) ? `${nw}×${nh}` : null;
        case 'aspectRatio': if (nw && nh) { const g = gcd(nw, nh); return `${nw/g}:${nh/g}`; } return null;
        case 'name':        return fileName || null;
        case 'extension':   return fileExt  || null;
        case 'pageCount':   return (numPages && numPages >= 1) ? `Page ${pageNum} of ${numPages}` : null;
        default:            return null; // fileSize, mimeType — async
    }
}

/**
 * Position the info bar inside the container (top or bottom).
 * anchorEl is the element the bar should appear before (previewImg or previewCanvas).
 */
function positionInfoBar(anchorEl) {
    const ib = currentSettings.settings.infoBar || {};
    if (ib.position === 'bottom') {
        previewContainer.appendChild(infoBar);
    } else {
        previewContainer.insertBefore(infoBar, anchorEl);
    }
}

// ─── Image info bar ───────────────────────────────────────────────────────────

function updateInfoBar(src) {
    const ib = currentSettings.settings.infoBar || {};
    if (!ib.enabled) { infoBar.style.display = 'none'; return; }

    positionInfoBar(previewImg);

    const shownItems = ib.shownItems || ['dimensions', 'name', 'extension', 'fileSize', 'mimeType', 'aspectRatio'];
    const nw = previewImg.naturalWidth;
    const nh = previewImg.naturalHeight;
    const { fileName, fileExt } = extractFileInfo(src);
    const needsAsync = shownItems.includes('fileSize') || shownItems.includes('mimeType');

    const syncParts = [];
    shownItems.forEach(id => {
        if (id === 'fileSize' || id === 'mimeType' || id === 'pageCount') return;
        const val = getInfoValue(id, nw, nh, fileName, fileExt, null, null);
        if (val) syncParts.push(val);
    });

    infoBar.textContent = syncParts.join(' · ');
    infoBar.style.display = (syncParts.length > 0 || needsAsync) ? 'block' : 'none';

    if (needsAsync) fetchImageMeta(src, shownItems, nw, nh, fileName, fileExt);
}

function fetchImageMeta(src, shownItems, nw, nh, fileName, fileExt) {
    fetch(src, { method: 'HEAD', mode: 'cors' })
        .then(res => {
            const mime   = res.headers.get('Content-Type');
            const sizeHd = res.headers.get('Content-Length');
            const parts  = [];
            shownItems.forEach(id => {
                if (id === 'mimeType' && mime)   { parts.push(mime.split(';')[0].trim()); return; }
                if (id === 'fileSize' && sizeHd) { parts.push(formatFileSize(parseInt(sizeHd, 10))); return; }
                if (id === 'pageCount') return;
                const val = getInfoValue(id, nw, nh, fileName, fileExt, null, null);
                if (val) parts.push(val);
            });
            if (infoBar) {
                infoBar.textContent = parts.join(' · ');
                infoBar.style.display = parts.length > 0 ? 'block' : 'none';
                updatePosition(
                    parseInt(previewContainer.style.left) || 0,
                    parseInt(previewContainer.style.top)  || 0
                );
            }
        })
        .catch(err => console.warn('[Interactive-Previews] HEAD failed:', err.message));
}

// ─── PDF info bar ─────────────────────────────────────────────────────────────

function updatePdfInfoBar(url, pageNum, numPages) {
    const ib = currentSettings.settings.infoBar || {};
    if (!ib.enabled) { infoBar.style.display = 'none'; return; }

    positionInfoBar(previewCanvas);

    const { fileName, fileExt } = extractFileInfo(url);
    const shownItems   = ib.shownItems || [];
    const parts        = [];

    shownItems.forEach(id => {
        if (id === 'dimensions' || id === 'aspectRatio' || id === 'fileSize' || id === 'mimeType') return;
        
        if (id === 'extension') {
            parts.push('PDF'); // Always show PDF rather than raw extension for consistency
            return;
        }

        const val = getInfoValue(id, null, null, fileName, fileExt, pageNum, numPages);
        if (val) parts.push(val);
    });

    infoBar.textContent = parts.join(' · ');
    infoBar.style.display = parts.length > 0 ? 'block' : 'none';
}
