// ── pdf preview state ───────────────────────────────────────────────────────────
// keeping these as module-level vars since pdf rendering is stateful and async
let currentPdfTask   = null;  // the pdfjs loading task (needed to cancel it)
let currentPdfDoc    = null;  // loaded pdf document object
let currentPdfUrl    = '';    // url of whatever pdf is currently shown
let currentPdfPage   = 1;     // current page number in 'pages' scroll mode
let totalPdfPages    = 0;     // total pages in doc (0 if nothing loaded)
let isPdfMode        = false; // flag so content.js knows which mode we're in
let pdfScrollBound   = null;  // bound reference to wheel handler (need it to remove listener later)
let pdfScrollTimer   = null;  // debounce timer for page scroll in 'pages' mode

// ── scroll navigation (pages mode only) ────────────────────────────────────────

// attach wheel listener for page flipping — only active when pdf is showing
function activatePdfScroll() {
    if (pdfScrollBound) return; // already attached, dont double-add
    pdfScrollBound = handlePdfWheel;
    document.addEventListener('wheel', pdfScrollBound, { passive: false }); // passive:false so we can preventDefault
}

function deactivatePdfScroll() {
    if (pdfScrollBound) {
        document.removeEventListener('wheel', pdfScrollBound);
        pdfScrollBound = null;
    }
    // clear debounce timer too
    if (pdfScrollTimer) {
        clearTimeout(pdfScrollTimer);
        pdfScrollTimer = null;
    }
}

function handlePdfWheel(e) {
    // if preview somehow got hidden, just cleanup and bail
    if (!previewContainer || !previewContainer.classList.contains('visible')) {
        deactivatePdfScroll();
        return;
    }

    // only intercept scroll if cursor is actually over the preview — dont steal page scroll
    const rect = previewContainer.getBoundingClientRect();
    const overContainer = e.clientX >= rect.left && e.clientX <= rect.right &&
                          e.clientY >= rect.top  && e.clientY <= rect.bottom;
    if (!overContainer) return;

    const dir     = e.deltaY > 0 ? 1 : -1;
    const newPage = Math.max(1, Math.min(totalPdfPages, currentPdfPage + dir));

    // at first/last page — let scroll pass through to the page
    if (newPage === currentPdfPage) return;

    e.preventDefault(); // consume the scroll event
    // debounce: ignore subsequent wheel ticks until render finishes (350ms)
    if (pdfScrollTimer) return;

    currentPdfPage = newPage;
    pdfScrollTimer = setTimeout(() => { pdfScrollTimer = null; }, 350);
    renderPdfPage(currentPdfPage);
}

// ── page rendering ──────────────────────────────────────────────────────────────

// calculate render scale based on user's size setting and actual page dimensions
function getPdfRenderScale(pageWidth, pageHeight) {
    const { pdfSizeMode: sizeMode, pdfCustomSize: customSize } = currentSettings.settings;
    const vw = window.innerWidth, vh = window.innerHeight, pad = 40;
    let scale = 1.0;

    if (sizeMode === 'custom') {
        // fit longest side to user-defined px
        const max = customSize || 512;
        scale = pageWidth >= pageHeight ? max / pageWidth : max / pageHeight;
    } else {
        // viewport mode (default)
        // fill as much screen as possible without overflow
        scale = Math.min((vw-pad)/pageWidth, (vh-pad)/pageHeight);
    }

    return Math.max(scale, 0.1); // never go below 0.1, otherwise canvas gets invisible
}

// after re-render container might overflow the viewport — nudge it back in
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

// renders a single pdf page onto a fresh canvas
// also builds text layer (for selection) and annotation layer (for links inside pdf)
async function renderPdfPage(pageNum) {
    if (!currentPdfDoc) return;
    if (!previewContainer.classList.contains('visible')) return; // user closed preview while we were waiting

    try {
        previewContainer.classList.add('pdf-loading'); // show spinner

        const page     = await currentPdfDoc.getPage(pageNum);
        const rawVP    = page.getViewport({ scale: 1.0 });
        const scale    = getPdfRenderScale(rawVP.width, rawVP.height);
        const viewport = page.getViewport({ scale });

        // reuse existing wrapper if there, otherwise create it
        let pageWrapper = document.getElementById('interactive-preview-pdf-page');
        if (!pageWrapper) {
            pageWrapper = document.createElement('div');
            pageWrapper.id = 'interactive-preview-pdf-page';
            pageWrapper.className = 'pdf-page-container';
            // insert before infoBar so bar stays on top/bottom correctly
            if (infoBar && infoBar.parentNode === previewContainer) {
                previewContainer.insertBefore(pageWrapper, infoBar);
            } else {
                previewContainer.appendChild(pageWrapper);
            }
        }
        // wipe and resize for the new page
        pageWrapper.innerHTML = '';
        pageWrapper.style.width  = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;

        // fresh canvas per render — reusing old canvas causes glitches between pages
        const canvas = document.createElement('canvas');
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        pageWrapper.appendChild(canvas);

        const renderContext = { canvasContext: canvas.getContext('2d'), viewport };
        await page.render(renderContext).promise;

        // text layer — lets users select/copy text from the pdf
        const textLayerDiv = document.createElement('div');
        textLayerDiv.className = 'textLayer';
        textLayerDiv.style.setProperty('--scale-factor', viewport.scale); // css var used by pdfjs text layer styles
        pageWrapper.appendChild(textLayerDiv);
        try {
            const textContent = await page.getTextContent();
            await pdfjsLib.renderTextLayer({
                textContentSource: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            }).promise;
        } catch(e) { console.warn('Text layer render failed', e); } // non-fatal, just no selection

        // annotation layer — renders clickable links that exist inside the pdf
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
                // dummy link service — we only need basic url resolution, no internal nav
                linkService: { getDestinationHash: (dest) => dest, getAnchorUrl: (url) => url || '' }
            });
        } catch(e) { console.warn('Annotation layer render failed', e); } // also non-fatal

        previewContainer.classList.remove('pdf-loading');
        // enable pointer events so user can click links / select text
        previewContainer.style.pointerEvents = 'auto';
        previewContainer.style.width = viewport.width + 'px';

        updatePdfInfoBar(currentPdfUrl, pageNum, totalPdfPages);
        clampPosition(); // make sure it didnt go offscreen after resize
    } catch (err) {
        console.error('[Interactive-Previews] Page render error:', err);
        previewContainer.classList.remove('pdf-loading');
    }
}

// ── scrollable mode (vertical / horizontal) ─────────────────────────────────────

// renders ALL pages into one scrollable div (up to 20 pages max to avoid killing memory)
// used when pdfScrollMode is 'vertical' or 'horizontal'
async function renderScrollablePdf(url, pdf, direction) {
    const vw = window.innerWidth, vh = window.innerHeight, pad = 40;

    // reuse scroll wrapper if already in dom
    let scrollDiv = document.getElementById('interactive-preview-pdf-scroll');
    if (!scrollDiv) {
        scrollDiv = document.createElement('div');
        scrollDiv.id = 'interactive-preview-pdf-scroll';
        previewContainer.appendChild(scrollDiv);
    }
    scrollDiv.innerHTML = ''; // wipe prev content

    // set layout direction via inline styles
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

    // use first page to figure out render scale for all pages
    const firstPage = await pdf.getPage(1);
    const rawVP     = firstPage.getViewport({ scale: 1.0 });
    const scale     = getPdfRenderScale(rawVP.width, rawVP.height);

    const limit = Math.min(totalPdfPages, 20); // hard cap at 20 pages — huge pdfs would OOM otherwise

    // IMPORTANT: set container width before the loop — otherwise canvases render squished on vertical scroll
    let targetWidth = 0;
    if (direction === 'vertical') {
        // +16px to account for scrollbar width so canvas isnt squished
        targetWidth = Math.min(firstPage.getViewport({ scale }).width + 16, vw - pad);
    } else {
        targetWidth = Math.min(scrollDiv.scrollWidth, vw - pad);
    }
    previewContainer.style.width = targetWidth + 'px';

    for (let i = 1; i <= limit; i++) {
        if (!previewContainer.classList.contains('visible')) return; // bail if preview was closed mid-render
        const page     = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-container';
        pageWrapper.style.width  = `${viewport.width}px`;
        pageWrapper.style.height = `${viewport.height}px`;
        pageWrapper.style.flexShrink = '0'; // dont let flex compress the pages
        scrollDiv.appendChild(pageWrapper);

        const canvas   = document.createElement('canvas');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        pageWrapper.appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        // text layer per page
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
        } catch(e) {} // dont care if text layer fails on individual pages

        // annotation layer per page
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

    // show info bar for scrollable mode too (starts at page 1)
    updatePdfInfoBar(url, 1, totalPdfPages);

    // track which page is visible as user scrolls, update info bar accordingly
    scrollDiv.addEventListener('scroll', () => {
        if (!isPdfMode) return;
        let currentPage = 1;
        const children = scrollDiv.children;
        const scrollPos = direction === 'vertical' ? scrollDiv.scrollTop : scrollDiv.scrollLeft;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const childStart = direction === 'vertical' ? child.offsetTop : child.offsetLeft;
            const childSize = direction === 'vertical' ? child.offsetHeight : child.offsetWidth;
            // page is "current" if scroll is before the halfway point of that page
            if (scrollPos < childStart + childSize / 2) {
                currentPage = i + 1;
                break;
            }
        }
        updatePdfInfoBar(url, currentPage, totalPdfPages);
    });

    // horizontal: resize container to fit actual rendered content width
    if (direction === 'horizontal') {
        previewContainer.style.width = Math.min(scrollDiv.scrollWidth, vw - pad) + 'px';
    }

    clampPosition();
}

// ── task lifecycle ──────────────────────────────────────────────────────────────

// cancel and clean up any in-progress pdf loading — call this before starting a new one
function cancelPdfTask() {
    if (currentPdfTask) {
        currentPdfTask.destroy().catch(() => {}); // destroy can throw if already done, ignore
        currentPdfTask = null;
    }
    // reset all state vars
    currentPdfDoc  = null;
    currentPdfPage = 1;
    totalPdfPages  = 0;
    currentPdfUrl  = '';
    isPdfMode      = false;

    // remove scroll wrapper from dom if it exists
    const scrollDiv = document.getElementById('interactive-preview-pdf-scroll');
    if (scrollDiv) scrollDiv.remove();
}

// sends a message to the background SW to fetch the pdf
// returns a promise that resolves to Uint8Array of the pdf bytes
function fetchPdfViaBackground(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FETCH_PDF', url }, (response) => {
            if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
            if (!response || !response.success) { reject(new Error(response?.error || 'Background fetch failed')); return; }
            resolve(new Uint8Array(response.data)); // reconstruct typed array from plain array
        });
    });
}

// ── entry point ─────────────────────────────────────────────────────────────────

// main fn called by content.js when a pdf link is hovered
async function showPdfPreview(url, x, y) {
    if (typeof pdfjsLib === 'undefined') {
        console.warn('[Interactive-Previews] PDF.js not loaded.');
        return;
    }

    console.log('[Interactive-Previews] Show PDF preview:', url);
    createPreviewContainer();
    cancelPdfTask();          // kill any prev pdf
    deactivatePdfScroll();    // remove old wheel listener

    // remove leftover scroll wrapper from previous pdf
    const oldScroll = document.getElementById('interactive-preview-pdf-scroll');
    if (oldScroll) oldScroll.remove();

    // switch to pdf mode: hide img, show canvas placeholder while loading
    isPdfMode = true;
    previewImg.style.display = 'none';
    previewCanvas.style.display = '';
    infoBar.textContent = '';
    infoBar.style.display = 'none';
    previewContainer.style.width = '200px'; // placeholder width while loading
    previewContainer.classList.remove('pdf-error');
    previewContainer.classList.add('pdf-loading', 'visible');
    updatePosition(x, y);

    try {
        console.log('[Interactive-Previews] Fetching PDF via background SW...');
        const pdfData = await fetchPdfViaBackground(url);
        // user might have moved away while fetch was in flight — bail if so
        if (!previewContainer.classList.contains('visible')) return;

        const task = pdfjsLib.getDocument({ data: pdfData, cMapPacked: true });
        currentPdfTask = task;

        const pdf = await task.promise;
        if (!previewContainer.classList.contains('visible')) return; // check again after async

        currentPdfDoc  = pdf;
        currentPdfUrl  = url;
        currentPdfPage = 1;
        totalPdfPages  = pdf.numPages;
        currentPdfTask = null; // task done, clear ref

        const pdfScrollMode = (currentSettings.settings.pdfScrollMode) || 'pages';

        if (pdfScrollMode === 'vertical' || pdfScrollMode === 'horizontal') {
            // scrollable mode: render all pages in a scroll container
            previewCanvas.style.display = 'none';
            await renderScrollablePdf(url, pdf, pdfScrollMode);
            // no manual wheel listener needed — native scroll handles it
        } else {
            // pages mode: render one page at a time, wheel to navigate
            await renderPdfPage(1);
            activatePdfScroll();
        }

    } catch (err) {
        // something went wrong (bad url, cors, corrupt pdf, etc) — show error state
        console.error('[Interactive-Previews] PDF error:', err);
        previewContainer.classList.remove('pdf-loading');
        previewContainer.classList.add('pdf-error');
        previewContainer.style.width = '240px';

        // draw error msg directly on canvas
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
