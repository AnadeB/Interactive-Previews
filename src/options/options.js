// ===== Info Bar Item Definitions =====
const INFO_ITEMS = [
    { id: 'dimensions', label: 'Dimensions <span class="description-text" style="font-size:0.85em; opacity:0.7;">(images only)</span>', example: 'ex: 1920×1080' },
    { id: 'name', label: 'File Name', example: 'ex: photo.jpg' },
    { id: 'extension', label: 'Extension', example: 'ex: PNG' },
    { id: 'fileSize', label: 'File Size', example: 'ex: 245 KB' },
    { id: 'mimeType', label: 'MIME Type', example: 'ex: image/webp' },
    { id: 'aspectRatio', label: 'Aspect Ratio <span class="description-text" style="font-size:0.85em; opacity:0.7;">(images only)</span>', example: 'ex: 16:9' },
    { id: 'pageCount', label: 'Pages Count <span class="description-text" style="font-size:0.85em; opacity:0.7;">(PDF only)</span>', example: 'ex: Page 1 of 5' }
];

const DEFAULT_INFOBAR_ORDER = INFO_ITEMS.map(i => i.id);

// Default settings
const defaultSettings = {
    mode: 'blocklist',
    blocklist: [],
    allowlist: [],
    theme: 'green',
    settings: {
        delay: 500,
        triggerModifiers: {
            shift: false,
            ctrl: false,
            alt: false
        },
        imageSizeMode: 'original',
        imageOriginalFitToScreen: true,
        imageCustomSize: 512,
        pdfSizeMode: 'viewport',
        pdfCustomSize: 512,
        pdfScrollMode: 'pages',
        infoBar: {
            enabled: false,
            position: 'top',
            shownItems: [...DEFAULT_INFOBAR_ORDER],
            hiddenItems: []
        },
        allowedFileTypes: {
            jpg: true, png: true, gif: true, webp: true, svg: true,
            avif: true, bmp: true, ico: true, tiff: true
        },
        deepSearch: {
            searchInside: true,
            cssBackgrounds: true,
            imageLinkHrefs: true
        },
        imagePreviewsEnabled: true,
        pdfPreviewsEnabled: true
    }
};

// ===== UI Elements =====
const els = {
    tabOff: document.getElementById('mode-off'),
    tabBlocklist: document.getElementById('mode-blocklist'),
    tabAllowlist: document.getElementById('mode-allowlist'),
    tabBar: document.querySelector('.tab-bar'),
    blocklistContainer: document.getElementById('blocklist-container'),
    allowlistContainer: document.getElementById('allowlist-container'),
    offContainer: document.getElementById('off-container'),
    blocklist: document.getElementById('blocklist'),
    allowlist: document.getElementById('allowlist'),

    delay: document.getElementById('delay'),
    triggerShift: document.getElementById('triggerShift'),
    triggerCtrl: document.getElementById('triggerCtrl'),
    triggerAlt: document.getElementById('triggerAlt'),
    subDelay: document.getElementById('sub-delay'),

    imageSizeModeRadios: document.getElementsByName('imageSizeMode'),
    subImageOriginal: document.getElementById('sub-image-original'),
    subImageCustom: document.getElementById('sub-image-custom'),
    imageOriginalFitToScreen: document.getElementById('imageOriginalFitToScreen'),
    imageCustomSize: document.getElementById('imageCustomSize'),

    pdfSizeModeRadios: document.getElementsByName('pdfSizeMode'),
    subPdfCustom: document.getElementById('sub-pdf-custom'),
    pdfCustomSize: document.getElementById('pdfCustomSize'),

    infoBarEnabled: document.getElementById('infoBarEnabled'),
    infoBarPositionRadios: document.getElementsByName('infoBarPosition'),
    infoBarSuboptions: document.getElementById('infobar-suboptions'),
    activeList: document.getElementById('infobar-items-active'),
    hiddenList: document.getElementById('infobar-items-hidden'),

    typeJpg: document.getElementById('typeJpg'),
    typePng: document.getElementById('typePng'),
    typeGif: document.getElementById('typeGif'),
    typeWebp: document.getElementById('typeWebp'),
    typeSvg: document.getElementById('typeSvg'),
    typeAvif: document.getElementById('typeAvif'),
    typeBmp: document.getElementById('typeBmp'),
    typeIco: document.getElementById('typeIco'),
    typeTiff: document.getElementById('typeTiff'),

    deepSearchInside: document.getElementById('deepSearchInside'),
    deepSearchCssBackgrounds: document.getElementById('deepSearchCssBackgrounds'),
    deepSearchImageLinks: document.getElementById('deepSearchImageLinks'),

    imagePreviewsEnabled: document.getElementById('imagePreviewsEnabled'),
    pdfPreviewsEnabled: document.getElementById('pdfPreviewsEnabled'),
    imageSuboptions: document.getElementById('image-suboptions'),
    pdfSuboptions: document.getElementById('pdf-suboptions'),

    saveHint: document.getElementById('save-hint'),
    pdfScrollModeRadios: document.getElementsByName('pdfScrollMode'),
    themeBtns: document.querySelectorAll('.theme-btn')
};

// ===== Helpers =====
const getListFromTextarea = (textarea) => {
    return textarea.value.split('\n').filter(line => line.trim() !== '');
};

const setListToTextarea = (textarea, list) => {
    textarea.value = (list || []).join('\n');
};

// ===== Drag Handle SVG path (inline for items) =====
const DRAG_ICON_PATH = '../../assets/icons/icon_draging_24.svg';

// ===== Build a single drag item element =====
function createDragItem(itemId) {
    const def = INFO_ITEMS.find(i => i.id === itemId);
    if (!def) return null;

    const el = document.createElement('div');
    el.className = 'drag-item';
    el.dataset.itemId = itemId;
    el.draggable = true;

    const handle = document.createElement('img');
    handle.src = DRAG_ICON_PATH;
    handle.className = 'drag-handle';
    handle.alt = 'drag';
    handle.draggable = false;

    const label = document.createElement('span');
    label.className = 'drag-label';
    label.innerHTML = def.label;

    const example = document.createElement('span');
    example.className = 'drag-example';
    example.textContent = def.example;

    el.appendChild(handle);
    el.appendChild(label);
    el.appendChild(example);

    el.addEventListener('dragstart', (e) => {
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', itemId);
    });

    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        clearAllIndicators();
        scheduleSave();
    });

    return el;
}

// ===== Populate drag lists =====
function populateDragLists(shownItems, hiddenItems) {
    els.activeList.innerHTML = '';
    els.hiddenList.innerHTML = '';

    shownItems.forEach(id => {
        const item = createDragItem(id);
        if (item) els.activeList.appendChild(item);
    });

    hiddenItems.forEach(id => {
        const item = createDragItem(id);
        if (item) els.hiddenList.appendChild(item);
    });
}

// ===== Read current order from DOM =====
function getShownItemIds() {
    return Array.from(els.activeList.querySelectorAll('.drag-item')).map(el => el.dataset.itemId);
}

function getHiddenItemIds() {
    return Array.from(els.hiddenList.querySelectorAll('.drag-item')).map(el => el.dataset.itemId);
}

// ===== Drag-and-drop logic for both lists =====
function clearAllIndicators() {
    document.querySelectorAll('.drag-over-indicator').forEach(el => el.remove());
}

function setupDropZone(listEl) {
    listEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        clearAllIndicators();

        const afterElement = getDragAfterElement(listEl, e.clientY);
        const indicator = document.createElement('div');
        indicator.className = 'drag-over-indicator';

        if (afterElement) {
            listEl.insertBefore(indicator, afterElement);
        } else {
            listEl.appendChild(indicator);
        }
    });

    listEl.addEventListener('dragleave', (e) => {
        if (!listEl.contains(e.relatedTarget)) {
            clearAllIndicators();
        }
    });

    listEl.addEventListener('drop', (e) => {
        e.preventDefault();
        clearAllIndicators();

        const itemId = e.dataTransfer.getData('text/plain');
        const draggedEl = document.querySelector(`.drag-item[data-item-id="${itemId}"]`);
        if (!draggedEl) return;

        const afterElement = getDragAfterElement(listEl, e.clientY);

        if (afterElement) {
            listEl.insertBefore(draggedEl, afterElement);
        } else {
            listEl.appendChild(draggedEl);
        }

        scheduleSave();
    });
}

function getDragAfterElement(container, y) {
    const elements = [...container.querySelectorAll('.drag-item:not(.dragging)')];

    return elements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function getCurrentMode() {
    if (els.tabOff.classList.contains('active')) return 'off';
    if (els.tabAllowlist.classList.contains('active')) return 'allowlist';
    return 'blocklist';
}

// ===== Toggle visibility based on interactions =====
const updateUIState = () => {
    const selectedMode = getCurrentMode();

    els.blocklistContainer.classList.toggle('hidden', selectedMode !== 'blocklist');
    els.allowlistContainer.classList.toggle('hidden', selectedMode !== 'allowlist');
    els.offContainer.classList.toggle('hidden', selectedMode !== 'off');

    els.tabOff.classList.toggle('active', selectedMode === 'off');
    els.tabBlocklist.classList.toggle('active', selectedMode === 'blocklist');
    els.tabAllowlist.classList.toggle('active', selectedMode === 'allowlist');

    // Image Size Mode Toggle
    const selectedImageMode = Array.from(els.imageSizeModeRadios).find(r => r.checked)?.value;

    els.subImageOriginal.classList.remove('disabled');
    els.imageOriginalFitToScreen.disabled = false;
    els.subImageCustom.classList.remove('disabled');
    els.imageCustomSize.disabled = false;

    if (selectedImageMode === 'original') {
        els.subImageCustom.classList.add('disabled');
        els.imageCustomSize.disabled = true;
    } else if (selectedImageMode === 'custom') {
        els.subImageOriginal.classList.add('disabled');
        els.imageOriginalFitToScreen.disabled = true;
    } else {
        els.subImageOriginal.classList.add('disabled');
        els.imageOriginalFitToScreen.disabled = true;
        els.subImageCustom.classList.add('disabled');
        els.imageCustomSize.disabled = true;
    }

    // PDF Size Mode Toggle
    const selectedPdfMode = Array.from(els.pdfSizeModeRadios).find(r => r.checked)?.value;
    els.subPdfCustom.classList.remove('disabled');
    els.pdfCustomSize.disabled = false;

    if (selectedPdfMode !== 'custom') {
        els.subPdfCustom.classList.add('disabled');
        els.pdfCustomSize.disabled = true;
    }

    // Image Previews Master Toggle
    const imageEnabled = els.imagePreviewsEnabled.checked;
    if (imageEnabled) {
        els.imageSuboptions.classList.remove('disabled');
    } else {
        els.imageSuboptions.classList.add('disabled');
    }

    // PDF Previews Master Toggle
    const pdfEnabled = els.pdfPreviewsEnabled.checked;
    if (pdfEnabled) {
        els.pdfSuboptions.classList.remove('disabled');
    } else {
        els.pdfSuboptions.classList.add('disabled');
    }

    // Info Bar Master Toggle
    const infoEnabled = els.infoBarEnabled.checked;
    if (infoEnabled) {
        els.infoBarSuboptions.classList.remove('disabled');
    } else {
        els.infoBarSuboptions.classList.add('disabled');
    }

    Array.from(els.infoBarPositionRadios).forEach(el => {
        el.disabled = !infoEnabled;
    });
};

// ===== Theme =====
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.themeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
}

// ===== Auto-save =====
let saveDebounceTimer = null;

function scheduleSave(delay = 300) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(saveOptions, delay);
}

function saveOptions() {
    const currentMode = getCurrentMode();
    const settings = {
        mode: currentMode,
        blocklist: getListFromTextarea(els.blocklist),
        allowlist: getListFromTextarea(els.allowlist),
        theme: document.documentElement.getAttribute('data-theme') || 'green',
        settings: {
            delay: parseInt(els.delay.value, 10) || 0,
            triggerModifiers: {
                shift: els.triggerShift.checked,
                ctrl: els.triggerCtrl.checked,
                alt: els.triggerAlt.checked
            },
            imageSizeMode: Array.from(els.imageSizeModeRadios).find(r => r.checked)?.value || 'original',
            imageOriginalFitToScreen: els.imageOriginalFitToScreen.checked,
            imageCustomSize: parseInt(els.imageCustomSize.value, 10) || 512,
            pdfSizeMode: Array.from(els.pdfSizeModeRadios).find(r => r.checked)?.value || 'viewport',
            pdfCustomSize: parseInt(els.pdfCustomSize.value, 10) || 512,
            pdfScrollMode: document.querySelector('input[name="pdfScrollMode"]:checked').value,
            infoBar: {
                enabled: els.infoBarEnabled.checked,
                position: Array.from(els.infoBarPositionRadios).find(r => r.checked)?.value || 'top',
                shownItems: getShownItemIds(),
                hiddenItems: getHiddenItemIds()
            },
            allowedFileTypes: {
                jpg: els.typeJpg.checked,
                png: els.typePng.checked,
                gif: els.typeGif.checked,
                webp: els.typeWebp.checked,
                svg: els.typeSvg.checked,
                avif: els.typeAvif.checked,
                bmp: els.typeBmp.checked,
                ico: els.typeIco.checked,
                tiff: els.typeTiff.checked
            },
            deepSearch: {
                searchInside: els.deepSearchInside.checked,
                cssBackgrounds: els.deepSearchCssBackgrounds.checked,
                imageLinkHrefs: els.deepSearchImageLinks.checked
            },
            imagePreviewsEnabled: els.imagePreviewsEnabled.checked,
            pdfPreviewsEnabled: els.pdfPreviewsEnabled.checked
        }
    };

    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            console.error('[Interactive-Previews] Error saving options:', chrome.runtime.lastError);
            return;
        }
        showSavedHint();
    });
}

function showSavedHint() {
    els.saveHint.textContent = 'Saved ✓';
    els.saveHint.classList.add('saved');
    clearTimeout(els.saveHint._hideTimer);
    els.saveHint._hideTimer = setTimeout(() => {
        els.saveHint.textContent = '';
        els.saveHint.classList.remove('saved');
    }, 1500);
}

// ===== Restore Options =====
const restoreOptions = () => {
    chrome.storage.sync.get(defaultSettings, (items) => {
        if (chrome.runtime.lastError) {
            console.error('[Interactive-Previews] Error loading options:', chrome.runtime.lastError);
            return;
        }

        const loadedMode = items.mode || 'blocklist';
        const loadedBlocklist = items.blocklist || [];
        const loadedAllowlist = items.allowlist || [];

        // Mode Tabs
        els.tabOff.classList.toggle('active', loadedMode === 'off');
        els.tabBlocklist.classList.toggle('active', loadedMode === 'blocklist');
        els.tabAllowlist.classList.toggle('active', loadedMode === 'allowlist');

        // Lists
        setListToTextarea(els.blocklist, loadedBlocklist);
        setListToTextarea(els.allowlist, loadedAllowlist);

        // Merge settings
        const s = { ...defaultSettings.settings, ...items.settings };
        const ib = { ...defaultSettings.settings.infoBar, ...(items.settings.infoBar || {}) };
        const ds = { ...defaultSettings.settings.deepSearch, ...(items.settings.deepSearch || {}) };
        const af = { ...defaultSettings.settings.allowedFileTypes, ...(items.settings.allowedFileTypes || {}) };

        let tMods = s.triggerModifiers || { shift: false, ctrl: false, alt: false };

        els.triggerShift.checked = !!tMods.shift;
        els.triggerCtrl.checked = !!tMods.ctrl;
        els.triggerAlt.checked = !!tMods.alt;
        els.delay.value = s.delay;

        // Image Size
        const iMode = s.imageSizeMode || s.sizeMode || 'original'; // backward compatibility
        Array.from(els.imageSizeModeRadios).forEach(r => {
            r.checked = r.value === iMode;
        });
        els.imageOriginalFitToScreen.checked = s.imageOriginalFitToScreen !== undefined ? s.imageOriginalFitToScreen : (s.originalFitToScreen !== undefined ? s.originalFitToScreen : true);
        els.imageCustomSize.value = s.imageCustomSize || s.customSize || 512;

        // PDF Size
        let pMode = s.pdfSizeMode || s.sizeMode || 'viewport';
        if (pMode === 'original') pMode = 'viewport'; // original not supported for PDF
        Array.from(els.pdfSizeModeRadios).forEach(r => {
            r.checked = r.value === pMode;
        });
        els.pdfCustomSize.value = s.pdfCustomSize || s.customSize || 512;

        // PDF Scroll Mode
        els.pdfScrollModeRadios.forEach(r => {
            r.checked = (r.value === (s.pdfScrollMode || 'pages'));
        });

        // Info Bar
        els.infoBarEnabled.checked = ib.enabled;
        Array.from(els.infoBarPositionRadios).forEach(r => {
            r.checked = r.value === ib.position;
        });

        // filter out any unknown ids in case items were removed in a future version
        const allKnownIds = DEFAULT_INFOBAR_ORDER;
        // Use .length check — empty array [] is truthy, so `|| fallback` alone wouldn't work
        let shownItems = (ib.shownItems && ib.shownItems.length > 0 ? ib.shownItems : [...DEFAULT_INFOBAR_ORDER])
            .filter(id => allKnownIds.includes(id));
        let hiddenItems = (ib.hiddenItems && ib.hiddenItems.length > 0 ? ib.hiddenItems : [])
            .filter(id => allKnownIds.includes(id));
        // Safety net: any known ID missing from both lists gets added to shownItems
        allKnownIds.forEach(id => {
            if (!shownItems.includes(id) && !hiddenItems.includes(id)) {
                shownItems.push(id);
            }
        });

        populateDragLists(shownItems, hiddenItems);

        // File Types
        els.typeJpg.checked = !!af.jpg;
        els.typePng.checked = !!af.png;
        els.typeGif.checked = !!af.gif;
        els.typeWebp.checked = !!af.webp;
        els.typeSvg.checked = !!af.svg;
        els.typeAvif.checked = !!af.avif;
        els.typeBmp.checked = !!af.bmp;
        els.typeIco.checked = !!af.ico;
        els.typeTiff.checked = !!af.tiff;

        // Deep Search
        els.deepSearchInside.checked = ds.searchInside;
        els.deepSearchCssBackgrounds.checked = ds.cssBackgrounds;
        els.deepSearchImageLinks.checked = ds.imageLinkHrefs !== false;

        // Master Toggles (migration logic included)
        // If the new settings don't exist yet, we infer them from the old settings if possible
        let imgEnabled = s.imagePreviewsEnabled;
        if (imgEnabled === undefined) {
            // Default to true, unless all image types were previously disabled
            imgEnabled = true; 
        }
        els.imagePreviewsEnabled.checked = imgEnabled;

        let pdfEnabled = s.pdfPreviewsEnabled;
        if (pdfEnabled === undefined) {
            // Infer from old pdf settings
            pdfEnabled = (af.pdf !== false) && (ds.pdfEnabled !== false);
        }
        els.pdfPreviewsEnabled.checked = pdfEnabled;

        // Theme
        applyTheme(items.theme || 'green');

        updateUIState();
    });
};

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
    setupDropZone(els.activeList);
    setupDropZone(els.hiddenList);

    restoreOptions();

    // Tab click listeners
    const setupTab = (el) => {
        el.addEventListener('click', () => {
            [els.tabOff, els.tabBlocklist, els.tabAllowlist].forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            updateUIState();
            scheduleSave();
        });
    };

    setupTab(els.tabOff);
    setupTab(els.tabBlocklist);
    setupTab(els.tabAllowlist);

    els.infoBarEnabled.addEventListener('change', () => { updateUIState(); scheduleSave(); });
    els.imagePreviewsEnabled.addEventListener('change', () => { updateUIState(); scheduleSave(); });
    els.pdfPreviewsEnabled.addEventListener('change', () => { updateUIState(); scheduleSave(); });

    // Theme buttons
    els.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
            scheduleSave(0); // save theme instantly
        });
    });
});

// Auto-save on all relevant inputs
Array.from(els.imageSizeModeRadios).forEach(r => r.addEventListener('change', () => { updateUIState(); scheduleSave(); }));
Array.from(els.pdfSizeModeRadios).forEach(r => r.addEventListener('change', () => { updateUIState(); scheduleSave(); }));

const autoSaveInputs = [
    els.blocklist, els.allowlist,
    els.triggerShift, els.triggerCtrl, els.triggerAlt, els.delay,
    els.imageCustomSize, els.imageOriginalFitToScreen, els.pdfCustomSize,
    els.typeJpg, els.typePng, els.typeGif, els.typeWebp, els.typeSvg,
    els.typeAvif, els.typeBmp, els.typeIco, els.typeTiff,
    els.deepSearchInside, els.deepSearchCssBackgrounds,
    els.deepSearchImageLinks
];
autoSaveInputs.forEach(el => {
    if(el) {
        el.addEventListener('input', () => scheduleSave());
        el.addEventListener('change', () => scheduleSave());
    }
});
els.pdfScrollModeRadios.forEach(el => {
    el.addEventListener('change', () => scheduleSave());
});

Array.from(els.infoBarPositionRadios).forEach(r => r.addEventListener('change', () => scheduleSave()));
