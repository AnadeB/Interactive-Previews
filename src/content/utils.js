// url matchers — used everywhere to detect what type of link we're dealing with
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico|tiff?)(\?|#|$)/i;
const PDF_EXT_RE   = /\.pdf(\?|#|$)/i;

// quick check: is this url a pdf we're allowed to preview
function isPdfUrl(url) {
    return typeof url === 'string' && PDF_EXT_RE.test(url) && isFileTypeAllowed(url);
}

// ── file info helpers ───────────────────────────────────────────────────────────

// pull filename + extension from a url string
// uses URL api first, falls back to manual split if thats broken (data urls etc)
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
        // URL() threw — probably malformed, do it manually
        const clean = src.split('?')[0].split('#')[0];
        const parts = clean.split('/');
        fileName = parts[parts.length - 1] || '';
        const dot = fileName.lastIndexOf('.');
        if (dot > 0) fileExt = fileName.substring(dot + 1).toUpperCase();
    }
    return { fileName, fileExt };
}

// formats bytes to human readable: B / KB / MB
function formatFileSize(bytes) {
    if (bytes < 1024)    return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

// checks if the url's file type is enabled in settings
// data: and blob: urls are allowed if at least one basic type is on
function isFileTypeAllowed(url) {
    if (typeof url !== 'string') return false;

    // data/blob urls dont have extensions, allow them if img is generally on
    if (url.startsWith('data:image/') || url.startsWith('blob:')) {
        const allowed = currentSettings.settings?.allowedFileTypes || {};
        return allowed.jpg !== false || allowed.png !== false || allowed.webp !== false;
    }

    const { fileExt } = extractFileInfo(url);
    // if we cant figure out the ext, just let it through — better false positive than missing previews
    if (!fileExt) return true;

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

    return true; // unknown ext → let it thru
}

// greatest common divisor, used for aspect ratio calc
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// ── element detection ───────────────────────────────────────────────────────────

// parse srcset string and return the highest-res url
// if descriptor is 'w', bigger number = better. if 'x', bigger = better too (scaled to 1000)
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
                // convert density to fake width so comparison works the same
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
            return bestUrl; // cant resolve, return as-is
        }
    }
    return null;
}

// main detection fn — given a hovered element + cursor pos, returns the best previewable url
// order matters: parent <a> first, then direct img, then containers, then css bg, then overlay fallback
function findImageSrc(target, x, y) {
    if (!target || target.nodeType !== 1) return null; // not an element node, bail

    const ds = currentSettings.settings.deepSearch || {};

    // 0. check if img is wrapped in a link to hi-res version — very common pattern on galleries/shops
    const parentA = target.closest('a');
    if (parentA && parentA.href) {
        const href = parentA.href;
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href) && isFileTypeAllowed(href)) return href;
        if (ds.pdfEnabled !== false && PDF_EXT_RE.test(href) && isFileTypeAllowed(href)) return href;
    }

    // 1. direct <img> — prefer srcset over src for best resolution
    if (target.tagName === 'IMG') {
        if (target.srcset) {
            const bestSrc = getBestSrcset(target.srcset, target.baseURI);
            if (bestSrc && isFileTypeAllowed(bestSrc)) return bestSrc;
        }
        // data-src for lazy loaded imgs (common on modern sites)
        const src = target.src || target.dataset.src;
        if (src && isFileTypeAllowed(src)) return src;
    }

    // 2. direct <a> pointing to img or pdf
    if (target.tagName === 'A' && target.href) {
        const href = target.href;
        if (ds.imageLinkHrefs !== false && IMAGE_EXT_RE.test(href) && isFileTypeAllowed(href)) return href;
        if (ds.pdfEnabled     !== false && PDF_EXT_RE.test(href) && isFileTypeAllowed(href))   return href;
    }

    // 3. search inside container elements
    // only triggers if cursor is literally on top of the found child element (bounding rect check)
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

        // also check links inside containers
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

    // 4. css background-image — grab url() value from computed style
    if (ds.cssBackgrounds !== false) {
        const bg = getComputedStyle(target).backgroundImage;
        if (bg && bg !== 'none') {
            const m = bg.match(/url\(["']?(.*?)["']?\)/);
            if (m && m[1] && isFileTypeAllowed(m[1])) return m[1];
        }
    }

    // 5. overlay fallback — elementsFromPoint sees thru pointer-events:none overlays
    // catches cases where hover fires on an icon/badge on top of the actual image
    if (ds.searchInside !== false && x !== undefined && y !== undefined) {
        const elementsUnderCursor = document.elementsFromPoint(x, y);
        for (const el of elementsUnderCursor) {
            if (el === target) continue; // already checked above

            if (el.tagName === 'IMG') {
                // skip 1x1 tracking pixels and invisible imgs
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

    return null; // nothing found
}

// same logic as findImageSrc but returns bool — used to decide if we should KEEP showing preview
// when cursor moves we check this to know if we're still "on" a trigger elem
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
            // coord-aware check — only count if cursor actually overlaps the child
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
            // no coords — less precise, just check if any child qualifies (used in mouseout path)
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

    // same overlay fallback as in findImageSrc
    if (ds.searchInside !== false && x !== undefined && y !== undefined) {
        const elementsUnderCursor = document.elementsFromPoint(x, y);
        for (const el of elementsUnderCursor) {
            if (el === target) continue;

            if (el.tagName === 'IMG') {
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
