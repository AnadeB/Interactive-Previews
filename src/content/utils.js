// ─── URL matchers ─────────────────────────────────────────────────────────────
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico|tiff?)(\?|#|$)/i;
const PDF_EXT_RE   = /\.pdf(\?|#|$)/i;

function isPdfUrl(url) {
    return typeof url === 'string' && PDF_EXT_RE.test(url);
}

// ─── File info ────────────────────────────────────────────────────────────────
function extractFileInfo(src) {
    let fileName = '', fileExt = '';
    try {
        const urlObj   = new URL(src);
        const parts    = urlObj.pathname.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart) {
            fileName = decodeURIComponent(lastPart);
            const dot = fileName.lastIndexOf('.');
            if (dot > 0) fileExt = fileName.substring(dot + 1).toUpperCase();
        }
    } catch (e) {
        const clean = src.split('?')[0].split('#')[0];
        const parts = clean.split('/');
        fileName = parts[parts.length - 1] || '';
        const dot = fileName.lastIndexOf('.');
        if (dot > 0) fileExt = fileName.substring(dot + 1).toUpperCase();
    }
    return { fileName, fileExt };
}

function formatFileSize(bytes) {
    if (bytes < 1024)    return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// ─── Element detection ────────────────────────────────────────────────────────

/**
 * Find the best previewable URL from the hovered element.
 * Respects deepSearch settings for each source type.
 */
function findImageSrc(target) {
    const ds = currentSettings.settings.deepSearch || {};

    // 1. Direct <img>
    if (target.tagName === 'IMG') {
        return target.src || target.dataset.src || null;
    }

    // 2. <a href> pointing to image or PDF
    if (target.tagName === 'A' && target.href) {
        const href = target.href;
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href)) return href;
        if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(href))   return href;
    }

    // 3. Search inside container elements
    if (ds.searchInside !== false) {
        const childImg = target.querySelector('img');
        if (childImg) {
            const src = childImg.src || childImg.dataset.src;
            if (src) return src;
        }
        const childA = target.querySelector('a[href]');
        if (childA && childA.href) {
            const href = childA.href;
            if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href)) return href;
            if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(href))   return href;
        }
    }

    // 4. CSS background-image
    if (ds.cssBackgrounds !== false) {
        const bg = getComputedStyle(target).backgroundImage;
        if (bg && bg !== 'none') {
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1]) return m[1];
        }
    }

    return null;
}

/**
 * Returns true if leaving this element should hide the preview.
 */
function isPreviewTrigger(target) {
    const ds = currentSettings.settings.deepSearch || {};

    if (target.tagName === 'IMG') return true;

    if (target.tagName === 'A' && target.href) {
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(target.href)) return true;
        if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(target.href))   return true;
    }

    if (ds.searchInside !== false) {
        if (target.querySelector('img')) return true;
        const childA = target.querySelector('a[href]');
        if (childA && childA.href) {
            if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(childA.href)) return true;
            if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(childA.href))   return true;
        }
    }

    if (ds.cssBackgrounds !== false) {
        const bg = getComputedStyle(target).backgroundImage;
        if (bg && bg !== 'none' && bg.includes('url(')) return true;
    }

    return false;
}
