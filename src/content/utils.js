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
 * Helper to parse srcset and return the absolute URL with the largest width/density.
 */
function getBestSrcset(srcset, baseURI) {
    if (!srcset) return null;
    const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
    let bestUrl = null;
    let maxWidth = -1;

    for (const part of parts) {
        const segments = part.split(/\s+/);
        if (segments.length === 0) continue;
        const url = segments[0];
        let width = 0;

        if (segments.length > 1) {
            const descriptor = segments[1];
            if (descriptor.endsWith('w')) {
                width = parseInt(descriptor.slice(0, -1), 10) || 0;
            } else if (descriptor.endsWith('x')) {
                width = parseFloat(descriptor.slice(0, -1)) * 1000 || 0;
            }
        }
        
        if (width >= maxWidth) {
            maxWidth = width;
            bestUrl = url;
        }
    }
    
    if (bestUrl) {
        try {
            return new URL(bestUrl, baseURI || document.baseURI).href;
        } catch(e) {
            return bestUrl;
        }
    }
    return null;
}

/**
 * Find the best previewable URL from the hovered element.
 * Respects deepSearch settings for each source type.
 */
function findImageSrc(target, x, y) {
    if (!target || target.nodeType !== 1) return null; // Ensure target is an Element

    const ds = currentSettings.settings.deepSearch || {};

    // 0. Check parent <a> first. If the image is wrapped in a link to a high-res image/pdf, use that.
    const parentA = target.closest('a');
    if (parentA && parentA.href) {
        const href = parentA.href;
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href) && isFileTypeAllowed(href)) return href;
        if (ds.pdfEnabled !== false && PDF_EXT_RE.test(href) && isFileTypeAllowed(href)) return href;
    }

    // 1. Direct <img>
    if (target.tagName === 'IMG') {
        if (target.srcset) {
            const bestSrc = getBestSrcset(target.srcset, target.baseURI);
            if (bestSrc && isFileTypeAllowed(bestSrc)) return bestSrc;
        }
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
    // Only triggers if the cursor is physically over the bounds of the found element
    if (ds.searchInside !== false && x !== undefined && y !== undefined) {
        const images = target.querySelectorAll('img');
        for (const childImg of images) {
            const rect = childImg.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                if (childImg.srcset) {
                    const bestSrc = getBestSrcset(childImg.srcset, childImg.baseURI);
                    if (bestSrc && isFileTypeAllowed(bestSrc)) return bestSrc;
                }
                const src = childImg.src || childImg.dataset.src;
                if (src && isFileTypeAllowed(src)) return src;
            }
        }
        
        const links = target.querySelectorAll('a[href]');
        for (const childA of links) {
            const href = childA.href;
            if ((ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href) && isFileTypeAllowed(href)) ||
                (ds.pdfEnabled !== false && PDF_EXT_RE.test(href) && isFileTypeAllowed(href))) {
                const rect = childA.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return href;
                }
            }
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

    // 5. Universal Overlay Fallback using elementsFromPoint.
    // If the mouse is physically over an image, but the event was caught by an overlay
    // (like an icon, badge, or transparent div), document.elementsFromPoint will find the image underneath.
    if (ds.searchInside !== false && x !== undefined && y !== undefined) {
        const elementsUnderCursor = document.elementsFromPoint(x, y);
        for (const el of elementsUnderCursor) {
            // We skip the original target since we already checked it
            if (el === target) continue;

            if (el.tagName === 'IMG') {
                // Ignore tiny tracking pixels or hidden images
                if (el.offsetWidth < 10 || el.offsetHeight < 10) continue;
                const style = getComputedStyle(el);
                if (style.opacity === '0' || style.visibility === 'hidden') continue;

                if (el.srcset) {
                    const bestSrc = getBestSrcset(el.srcset, el.baseURI);
                    if (bestSrc && isFileTypeAllowed(bestSrc)) return bestSrc;
                }
                const src = el.src || el.dataset.src;
                if (src && isFileTypeAllowed(src)) return src;
            }
        }
    }

    return null;
}

/**
 * Returns true if leaving this element should hide the preview.
 */
function isPreviewTrigger(target, x, y) {
    if (!target || target.nodeType !== 1) return false;

    const ds = currentSettings.settings.deepSearch || {};

    const parentA = target.closest('a');
    if (parentA && parentA.href) {
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(parentA.href) && isFileTypeAllowed(parentA.href)) return true;
        if (ds.pdfEnabled !== false && PDF_EXT_RE.test(parentA.href) && isFileTypeAllowed(parentA.href)) return true;
    }

    if (target.tagName === 'IMG') {
        if (target.srcset) {
            const bestSrc = getBestSrcset(target.srcset, target.baseURI);
            if (bestSrc && isFileTypeAllowed(bestSrc)) return true;
        }
        const src = target.src || target.dataset.src;
        if (src && isFileTypeAllowed(src)) return true;
    }

    if (target.tagName === 'A' && target.href) {
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(target.href) && isFileTypeAllowed(target.href)) return true;
        if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(target.href) && isFileTypeAllowed(target.href))   return true;
    }

    if (ds.searchInside !== false) {
        if (x !== undefined && y !== undefined) {
            const images = target.querySelectorAll('img');
            for (const childImg of images) {
                const rect = childImg.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    if (childImg.srcset) {
                        const bestSrc = getBestSrcset(childImg.srcset, childImg.baseURI);
                        if (bestSrc && isFileTypeAllowed(bestSrc)) return true;
                    }
                    const src = childImg.src || childImg.dataset.src;
                    if (src && isFileTypeAllowed(src)) return true;
                }
            }
            
            const links = target.querySelectorAll('a[href]');
            for (const childA of links) {
                const href = childA.href;
                if ((ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href) && isFileTypeAllowed(href)) ||
                    (ds.pdfEnabled !== false && PDF_EXT_RE.test(href) && isFileTypeAllowed(href))) {
                    const rect = childA.getBoundingClientRect();
                    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                        return true;
                    }
                }
            }
        } else {
            const childImg = target.querySelector('img');
            if (childImg) {
                if (childImg.srcset) {
                    const bestSrc = getBestSrcset(childImg.srcset, childImg.baseURI);
                    if (bestSrc && isFileTypeAllowed(bestSrc)) return true;
                }
                const src = childImg.src || childImg.dataset.src;
                if (src && isFileTypeAllowed(src)) return true;
            }
            const childA = target.querySelector('a[href]');
            if (childA && childA.href) {
                if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(childA.href) && isFileTypeAllowed(childA.href)) return true;
                if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(childA.href) && isFileTypeAllowed(childA.href))   return true;
            }
        }
    }

    if (ds.cssBackgrounds !== false) {
        const bg = getComputedStyle(target).backgroundImage;
        if (bg && bg !== 'none') {
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1] && isFileTypeAllowed(m[1])) return true;
        }
    }

    // 5. Universal Overlay Fallback using elementsFromPoint
    if (ds.searchInside !== false && x !== undefined && y !== undefined) {
        const elementsUnderCursor = document.elementsFromPoint(x, y);
        for (const el of elementsUnderCursor) {
            if (el === target) continue;

            if (el.tagName === 'IMG') {
                // Ignore tiny tracking pixels or hidden images
                if (el.offsetWidth < 10 || el.offsetHeight < 10) continue;
                const style = getComputedStyle(el);
                if (style.opacity === '0' || style.visibility === 'hidden') continue;

                if (el.srcset) {
                    const bestSrc = getBestSrcset(el.srcset, el.baseURI);
                    if (bestSrc && isFileTypeAllowed(bestSrc)) return true;
                }
                const src = el.src || el.dataset.src;
                if (src && isFileTypeAllowed(src)) return true;
            }
        }
    }

    return false;
}
