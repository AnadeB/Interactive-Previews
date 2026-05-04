// ─── PDF preview state ────────────────────────────────────────────────────────
let currentPdfTask   = null;
let currentPdfDoc    = null;
let currentPdfUrl    = '';
let currentPdfPage   = 1;
let totalPdfPages    = 0;
let isPdfMode        = false;
let pdfScrollBound   = null;
let pdfScrollTimer   = null;

// ─── Scroll navigation (pages mode) ──────────────────────────────────────────

function activatePdfScroll() {
    if (pdfScrollBound) return;
    pdfScrollBound = handlePdfWheel;
    document.addEventListener('wheel', pdfScrollBound, { passive: false });
}

function deactivatePdfScroll() {
    if (pdfScrollBound) {
        document.removeEventListener('wheel', pdfScrollBound);
        pdfScrollBound = null;
    }
    if (pdfScrollTimer) {
        clearTimeout(pdfScrollTimer);
        pdfScrollTimer = null;
    }
}

function handlePdfWheel(e) {
    if (!previewContainer || !previewContainer.classList.contains('visible')) {
        deactivatePdfScroll();
        return;
    }

    // Only intercept scroll when cursor is visually over the preview container
    const rect = previewContainer.getBoundingClientRect();
    const overContainer = e.clientX >= rect.left && e.clientX <= rect.right &&
                          e.clientY >= rect.top  && e.clientY <= rect.bottom;
    if (!overContainer) return;

    const dir     = e.deltaY > 0 ? 1 : -1;
    const newPage = Math.max(1, Math.min(totalPdfPages, currentPdfPage + dir));

    // At boundary — let page scroll through
    if (newPage === currentPdfPage) return;

    e.preventDefault();
    if (pdfScrollTimer) return;

    currentPdfPage = newPage;
    pdfScrollTimer = setTimeout(() => { pdfScrollTimer = null; }, 350);
    renderPdfPage(currentPdfPage);
}

// ─── Page rendering ───────────────────────────────────────────────────────────

function getPdfRenderScale(pageWidth, pageHeight) {
    const { sizeMode, originalFitToScreen, customSize } = currentSettings.settings;
    const vw = window.innerWidth, vh = window.innerHeight, pad = 40;
    let scale = 1.0;

    if (sizeMode === 'original') {
        if (originalFitToScreen) scale = Math.min(1.0, (vw-pad)/pageWidth, (vh-pad)/pageHeight);
    } else if (sizeMode === 'viewport') {
        scale = Math.min((vw-pad)/pageWidth, (vh-pad)/pageHeight);
    } else if (sizeMode === 'custom') {
        const max = customSize || 512;
        scale = pageWidth >= pageHeight ? max / pageWidth : max / pageHeight;
    }

    return Math.max(scale, 0.1);
}

/** Clamp preview container to viewport without adding offset (used after re-render). */
function clampPosition() {
    const r  = previewContainer.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = parseFloat(previewContainer.style.left) || 0;
    let top  = parseFloat(previewContainer.style.top)  || 0;
    if (left + r.width  > vw) left = vw - r.width  - 10;
    if (top  + r.height > vh) top  = vh - r.height - 10;
    if (left < 10) left = 10;
    if (top  < 10) top  = 10;
    previewContainer.style.left = `${left}px`;
    previewContainer.style.top  = `${top}px`;
}

async function renderPdfPage(pageNum) {
    if (!currentPdfDoc) return;
    if (!previewContainer.classList.contains('visible')) return;

    try {
        previewContainer.classList.add('pdf-loading');

        const page     = await currentPdfDoc.getPage(pageNum);
        const rawVP    = page.getViewport({ scale: 1.0 });
        const scale    = getPdfRenderScale(rawVP.width, rawVP.height);
        const viewport = page.getViewport({ scale });

        // Create page wrapper
        let pageWrapper = document.getElementById('interactive-preview-pdf-page');
        if (!pageWrapper) {
            pageWrapper = document.createElement('div');
            pageWrapper.id = 'interactive-preview-pdf-page';
            pageWrapper.className = 'pdf-page-container';
            // Insert before infoBar if it exists, else append
            if (infoBar && infoBar.parentNode === previewContainer) {
                previewContainer.insertBefore(pageWrapper, infoBar);
            } else {
                previewContainer.appendChild(pageWrapper);
            }
        }
        pageWrapper.innerHTML = '';
        pageWrapper.style.width  = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;

        // We use a local canvas instead of the global previewCanvas for layered structure
        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        pageWrapper.appendChild(canvas);

        const renderContext = { canvasContext: canvas.getContext('2d'), viewport };
        await page.render(renderContext).promise;

        // Render Text Layer
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        pageWrapper.appendChild(textLayerDiv);
        try {
            const textContent = await page.getTextContent();
            await pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            }).promise;
        } catch(e) { console.warn('Text layer render failed', e); }

        // Render Annotation Layer (Links)
        const annotationLayerDiv = document.createElement('div');
        annotationLayerDiv.className = 'annotationLayer';
        pageWrapper.appendChild(annotationLayerDiv);
        try {
            const annotations = await page.getAnnotations();
            pdfjsLib.AnnotationLayer.render({
                viewport: viewport.clone({ dontFlip: true }),
                div: annotationLayerDiv,
                annotations: annotations,
                page: page,
                linkService: { getDestinationHash: (dest) => dest, getAnchorUrl: (url) => url || '' } // Dummy service for simple external links
            });
        } catch(e) { console.warn('Annotation layer render failed', e); }

        previewContainer.classList.remove('pdf-loading');
        // Make the main container pointer-events:auto so we can interact with text/links
        previewContainer.style.pointerEvents = 'auto';
        previewContainer.style.width = viewport.width + 'px';

        updatePdfInfoBar(currentPdfUrl, pageNum, totalPdfPages);
        clampPosition(); // Fix: don't add offset, just keep within viewport
    } catch (err) {
        console.error('[Interactive-Previews] Page render error:', err);
        previewContainer.classList.remove('pdf-loading');
    }
}

// ─── Scrollable mode (vertical / horizontal) ──────────────────────────────────

/**
 * Renders all PDF pages into a scrollable div inside the preview container.
 * direction: 'vertical' | 'horizontal'
 */
async function renderScrollablePdf(url, pdf, direction) {
    const vw = window.innerWidth, vh = window.innerHeight, pad = 40;

    // Reuse or create the scroll wrapper
    let scrollDiv = document.getElementById('interactive-preview-pdf-scroll');
    if (!scrollDiv) {
        scrollDiv = document.createElement('div');
        scrollDiv.id = 'interactive-preview-pdf-scroll';
        previewContainer.appendChild(scrollDiv);
    }
    scrollDiv.innerHTML = '';

    // Layout direction
    if (direction === 'vertical') {
        scrollDiv.style.cssText =
            `display:flex; flex-direction:column; gap:4px;
             overflow-y:auto; overflow-x:hidden;
             max-height:${vh - pad}px; pointer-events:auto;
             scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.4) transparent;`;
    } else {
        scrollDiv.style.cssText =
            `display:flex; flex-direction:row; gap:4px;
             overflow-x:auto; overflow-y:hidden;
             max-width:${vw - pad}px; pointer-events:auto;
             scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.4) transparent;`;
    }

    // Get render scale from first page
    const firstPage = await pdf.getPage(1);
    const rawVP     = firstPage.getViewport({ scale: 1.0 });
    const scale     = getPdfRenderScale(rawVP.width, rawVP.height);

    const limit = Math.min(totalPdfPages, 20); // cap at 20 pages

    // Fix: set container width BEFORE rendering loop to avoid squished canvases
    let targetWidth = 0;
    if (direction === 'vertical') {
        // Add 16px to account for the vertical scrollbar so the canvas isn't shrunk
        targetWidth = Math.min(firstPage.getViewport({ scale }).width + 16, vw - pad);
    } else {
        targetWidth = Math.min(scrollDiv.scrollWidth, vw - pad);
    }
    previewContainer.style.width = targetWidth + 'px';

    for (let i = 1; i <= limit; i++) {
        if (!previewContainer.classList.contains('visible')) return; // aborted
        const page     = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-container';
        pageWrapper.style.width  = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;
        pageWrapper.style.flexShrink = '0';
        scrollDiv.appendChild(pageWrapper);

        const canvas   = document.createElement('canvas');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        pageWrapper.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        // Render Text Layer
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
        pageWrapper.appendChild(textLayerDiv);
        try {
            const textContent = await page.getTextContent();
            await pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            }).promise;
        } catch(e) {}

        // Render Annotation Layer
        const annotationLayerDiv = document.createElement('div');
        annotationLayerDiv.className = 'annotationLayer';
        pageWrapper.appendChild(annotationLayerDiv);
        try {
            const annotations = await page.getAnnotations();
            pdfjsLib.AnnotationLayer.render({
                viewport: viewport.clone({ dontFlip: true }),
                div: annotationLayerDiv,
                annotations: annotations,
                page: page,
                linkService: { getDestinationHash: (dest) => dest, getAnchorUrl: (url) => url || '' }
            });
        } catch(e) {}
    }

    previewContainer.classList.remove('pdf-loading');
    previewContainer.style.pointerEvents = 'auto';

    // Fix: Show the info bar for scrollable mode
    updatePdfInfoBar(url, 1, totalPdfPages);

    scrollDiv.addEventListener('scroll', () => {
        if (!isPdfMode) return;
        let currentPage = 1;
        const children = scrollDiv.children;
        const scrollPos = direction === 'vertical' ? scrollDiv.scrollTop : scrollDiv.scrollLeft;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childStart = direction === 'vertical' ? child.offsetTop : child.offsetLeft;
            const childSize = direction === 'vertical' ? child.offsetHeight : child.offsetWidth;
            // Check which page is mostly in view
            if (scrollPos < childStart + childSize / 2) {
                currentPage = i + 1;
                break;
            }
        }
        updatePdfInfoBar(url, currentPage, totalPdfPages);
    });

    if (direction === 'horizontal') {
        previewContainer.style.width = Math.min(scrollDiv.scrollWidth, vw - pad) + 'px';
    }

    clampPosition();
}

// ─── Task lifecycle ───────────────────────────────────────────────────────────

function cancelPdfTask() {
    if (currentPdfTask) {
        currentPdfTask.destroy().catch(() => {});
        currentPdfTask = null;
    }
    currentPdfDoc  = null;
    currentPdfPage = 1;
    totalPdfPages  = 0;
    currentPdfUrl  = '';
    isPdfMode      = false;

    // Remove scroll wrapper if it exists
    const scrollDiv = document.getElementById('interactive-preview-pdf-scroll');
    if (scrollDiv) scrollDiv.remove();
}

function fetchPdfViaBackground(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FETCH_PDF', url }, (response) => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            if (!response || !response.success) { reject(new Error(response?.error || 'Background fetch failed')); return; }
            resolve(new Uint8Array(response.data));
        });
    });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function showPdfPreview(url, x, y) {
    if (typeof pdfjsLib === 'undefined') {
        console.warn('[Interactive-Previews] PDF.js not loaded.');
        return;
    }

    console.log('[Interactive-Previews] Show PDF preview:', url);
    createPreviewContainer();
    cancelPdfTask();
    deactivatePdfScroll();

    // Hide existing scroll wrapper
    const oldScroll = document.getElementById('interactive-preview-pdf-scroll');
    if (oldScroll) oldScroll.remove();

    isPdfMode = true;
    previewImg.style.display = 'none';
    previewCanvas.style.display = '';
    infoBar.textContent = '';
    infoBar.style.display = 'none';
    previewContainer.style.width = '200px';
    previewContainer.classList.remove('pdf-error');
    previewContainer.classList.add('pdf-loading', 'visible');
    updatePosition(x, y);

    try {
        console.log('[Interactive-Previews] Fetching PDF via background SW...');
        const pdfData = await fetchPdfViaBackground(url);
        if (!previewContainer.classList.contains('visible')) return;

        const task = pdfjsLib.getDocument({ data: pdfData, cMapPacked: true });
        currentPdfTask = task;

        const pdf = await task.promise;
        if (!previewContainer.classList.contains('visible')) return;

        currentPdfDoc  = pdf;
        currentPdfUrl  = url;
        currentPdfPage = 1;
        totalPdfPages  = pdf.numPages;
        currentPdfTask = null;

        const pdfScrollMode = (currentSettings.settings.pdfScrollMode) || 'pages';

        if (pdfScrollMode === 'vertical' || pdfScrollMode === 'horizontal') {
            // Scrollable mode: hide single canvas, show scrollable div
            previewCanvas.style.display = 'none';
            await renderScrollablePdf(url, pdf, pdfScrollMode);
            // No document wheel listener needed — native scroll handles it
        } else {
            // Pages mode: single canvas + document wheel listener
            await renderPdfPage(1);
            activatePdfScroll();
        }

    } catch (err) {
        console.error('[Interactive-Previews] PDF error:', err);
        previewContainer.classList.remove('pdf-loading');
        previewContainer.classList.add('pdf-error');
        previewContainer.style.width = '240px';

        const ctx = previewCanvas.getContext('2d');
        previewCanvas.width  = 240;
        previewCanvas.height = 60;
        previewCanvas.style.display = '';
        ctx.fillStyle = '#c0392b';
        ctx.font = '13px Segoe UI, Arial, sans-serif';
        ctx.fillText('⚠ PDF preview unavailable', 10, 25);
        ctx.fillStyle = '#888';
        ctx.font = '11px Segoe UI, Arial, sans-serif';
        ctx.fillText(`(${err.message || 'unknown error'})`, 10, 45);
        clampPosition();
        currentPdfTask = null;
    }
}
