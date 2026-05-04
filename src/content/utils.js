// ─── URL matchers ─────────────────────────────────────────────────────────────
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico|tiff?)(\?|#|$)/i;
const PDF_EXT_RE   = /\.pdf(\?|#|$)/i;

function isPdfUrl(url) {
    return typeof url === 'string' && PDF_EXT_RE.test(url) && isFileTypeAllowed(url);
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

function isFileTypeAllowed(url) {
    if (typeof url !== 'string') return false;
    
    // For data URLs or blob URLs, allow if basic image types are enabled
    if (url.startsWith('data:image/') || url.startsWith('blob:')) {
        const allowed = currentSettings.settings?.allowedFileTypes || {};
        return allowed.jpg !== false || allowed.png !== false || allowed.webp !== false;
    }

    const { fileExt } = extractFileInfo(url);
    if (!fileExt) return true; // If we can't determine, allow by default so we don't break dynamic images
    
    const ext = fileExt.toLowerCase();
    const allowed = currentSettings.settings?.allowedFileTypes || {};
    
    if (ext === 'jpg' || ext === 'jpeg') return allowed.jpg !== false;
    if (ext === 'png') return allowed.png !== false;
    if (ext === 'gif') return allowed.gif !== false;
    if (ext === 'webp') return allowed.webp !== false;
    if (ext === 'svg') return allowed.svg !== false;
    if (ext === 'avif') return allowed.avif !== false;
    if (ext === 'bmp') return allowed.bmp !== false;
    if (ext === 'ico') return allowed.ico !== false;
    if (ext === 'tiff' || ext === 'tif') return allowed.tiff !== false;
    if (ext === 'pdf') return allowed.pdf !== false;
    
    return true; // Unknown extension, let it through
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
        const src = target.src || target.dataset.src;
        if (src && isFileTypeAllowed(src)) return src;
    }

    // 2. <a href> pointing to image or PDF
    if (target.tagName === 'A' && target.href) {
        const href = target.href;
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href) && isFileTypeAllowed(href)) return href;
        if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(href) && isFileTypeAllowed(href))   return href;
    }

    // 3. Search inside container elements
    if (ds.searchInside !== false) {
        const childImg = target.querySelector('img');
        if (childImg) {
            const src = childImg.src || childImg.dataset.src;
            if (src && isFileTypeAllowed(src)) return src;
        }
        const childA = target.querySelector('a[href]');
        if (childA && childA.href) {
            const href = childA.href;
            if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href) && isFileTypeAllowed(href)) return href;
            if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(href) && isFileTypeAllowed(href))   return href;
        }
    }

    // 4. CSS background-image
    if (ds.cssBackgrounds !== false) {
        const bg = getComputedStyle(target).backgroundImage;
        if (bg && bg !== 'none') {
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1] && isFileTypeAllowed(m[1])) return m[1];
        }
    }

    return null;
}

/**
 * Returns true if leaving this element should hide the preview.
 */
function isPreviewTrigger(target) {
    const ds = currentSettings.settings.deepSearch || {};

    if (target.tagName === 'IMG') {
        const src = target.src || target.dataset.src;
        if (src && isFileTypeAllowed(src)) return true;
    }

    if (target.tagName === 'A' && target.href) {
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(target.href) && isFileTypeAllowed(target.href)) return true;
        if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(target.href) && isFileTypeAllowed(target.href))   return true;
    }

    if (ds.searchInside !== false) {
        const childImg = target.querySelector('img');
        if (childImg) {
            const src = childImg.src || childImg.dataset.src;
            if (src && isFileTypeAllowed(src)) return true;
        }
        const childA = target.querySelector('a[href]');
        if (childA && childA.href) {
            if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(childA.href) && isFileTypeAllowed(childA.href)) return true;
            if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(childA.href) && isFileTypeAllowed(childA.href))   return true;
        }
    }

    if (ds.cssBackgrounds !== false) {
        const bg = getComputedStyle(target).backgroundImage;
        if (bg && bg !== 'none') {
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1] && isFileTypeAllowed(m[1])) return true;
        }
    }

    return false;
}
