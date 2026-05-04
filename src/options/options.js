// ===== Info Bar Item Definitions =====
const INFO_ITEMS = [
    { id: 'dimensions', label: 'Original Dimensions', example: 'ex: 1920×1080' },
    { id: 'name', label: 'File Name', example: 'ex: photo.jpg' },
    { id: 'extension', label: 'Extension', example: 'ex: PNG' },
    { id: 'fileSize', label: 'File Size', example: 'ex: 245 KB' },
    { id: 'mimeType', label: 'MIME Type', example: 'ex: image/webp' },
    { id: 'aspectRatio', label: 'Aspect Ratio', example: 'ex: 16:9' }
];

const DEFAULT_INFOBAR_ORDER = INFO_ITEMS.map(i => i.id);

// Default settings
const defaultSettings = {
    mode: 'blacklist',
    blacklist: [],
    whitelist: [],
    theme: 'green',
    settings: {
        delay: 500,
        triggerModifier: 'none',
        sizeMode: 'original',
        originalFitToScreen: true,
        customSize: 512,
        pdfScrollMode: 'pages',
        infoBar: {
            enabled: false,
            position: 'top',
            shownItems: [...DEFAULT_INFOBAR_ORDER],
            hiddenItems: []
        },
        deepSearch: {
            searchInside: true,
            cssBackgrounds: true,
            imageLinkHrefs: true,
            pdfEnabled: true
        }
    }
};

// ===== UI Elements =====
const els = {
    tabOff: document.getElementById('mode-off'),
    tabBlacklist: document.getElementById('mode-blacklist'),
    tabWhitelist: document.getElementById('mode-whitelist'),
    tabBar: document.querySelector('.tab-bar'),
    blacklistContainer: document.getElementById('blacklist-container'),
    whitelistContainer: document.getElementById('whitelist-container'),
    offContainer: document.getElementById('off-container'),
    blacklist: document.getElementById('blacklist'),
    whitelist: document.getElementById('whitelist'),
    delay: document.getElementById('delay'),
    sizeModeRadios: document.getElementsByName('sizeMode'),

    subOriginal: document.getElementById('sub-original'),
    subCustom: document.getElementById('sub-custom'),
    originalFitToScreen: document.getElementById('originalFitToScreen'),
    customSize: document.getElementById('customSize'),

    triggerModifierRadios: document.getElementsByName('triggerModifier'),
    subDelay: document.getElementById('sub-delay'),

    infoBarEnabled: document.getElementById('infoBarEnabled'),
    infoBarPositionRadios: document.getElementsByName('infoBarPosition'),
    infoBarSuboptions: document.getElementById('infobar-suboptions'),
    activeList: document.getElementById('infobar-items-active'),
    hiddenList: document.getElementById('infobar-items-hidden'),

    deepSearchInside: document.getElementById('deepSearchInside'),
    deepSearchCssBackgrounds: document.getElementById('deepSearchCssBackgrounds'),
    deepSearchImageLinks: document.getElementById('deepSearchImageLinks'),
    deepSearchPdfEnabled: document.getElementById('deepSearchPdfEnabled'),
    pdfScrollModeRadios: document.querySelectorAll('input[name="pdfScrollMode"]'),

    saveHint: document.getElementById('save-hint'),
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
    label.textContent = def.label;

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
    if (els.tabWhitelist.classList.contains('active')) return 'whitelist';
    return 'blacklist';
}

// ===== Toggle visibility based on interactions =====
const updateUIState = () => {
    const selectedMode = getCurrentMode();

    els.blacklistContainer.classList.toggle('hidden', selectedMode !== 'blacklist');
    els.whitelistContainer.classList.toggle('hidden', selectedMode !== 'whitelist');
    els.offContainer.classList.toggle('hidden', selectedMode !== 'off');

    els.tabOff.classList.toggle('active', selectedMode === 'off');
    els.tabBlacklist.classList.toggle('active', selectedMode === 'blacklist');
    els.tabWhitelist.classList.toggle('active', selectedMode === 'whitelist');

    // Size Mode Toggle
    const selectedSizeMode = Array.from(els.sizeModeRadios).find(r => r.checked)?.value;

    els.subOriginal.classList.remove('disabled');
    els.originalFitToScreen.disabled = false;
    els.subCustom.classList.remove('disabled');
    els.customSize.disabled = false;

    if (selectedSizeMode === 'original') {
        els.subCustom.classList.add('disabled');
        els.customSize.disabled = true;
    } else if (selectedSizeMode === 'custom') {
        els.subOriginal.classList.add('disabled');
        els.originalFitToScreen.disabled = true;
    } else {
        els.subOriginal.classList.add('disabled');
        els.originalFitToScreen.disabled = true;
        els.subCustom.classList.add('disabled');
        els.customSize.disabled = true;
    }

    // Trigger Modifier Delay Toggle
    const selectedTriggerModifier = Array.from(els.triggerModifierRadios).find(r => r.checked)?.value;
    if (selectedTriggerModifier === 'none') {
        els.subDelay.classList.remove('hidden');
    } else {
        els.subDelay.classList.add('hidden');
    }

    // Info Bar — disable sub-options when master is off
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
        blacklist: getListFromTextarea(els.blacklist),
        whitelist: getListFromTextarea(els.whitelist),
        theme: document.documentElement.getAttribute('data-theme') || 'green',
        settings: {
            delay: parseInt(els.delay.value, 10) || 0,
            triggerModifier: Array.from(els.triggerModifierRadios).find(r => r.checked)?.value || 'none',
            sizeMode: Array.from(els.sizeModeRadios).find(r => r.checked)?.value || 'original',
            originalFitToScreen: els.originalFitToScreen.checked,
            customSize: parseInt(els.customSize.value, 10) || 512,
            pdfScrollMode: document.querySelector('input[name="pdfScrollMode"]:checked').value,
            infoBar: {
                enabled: els.infoBarEnabled.checked,
                position: Array.from(els.infoBarPositionRadios).find(r => r.checked)?.value || 'top',
                shownItems: getShownItemIds(),
                hiddenItems: getHiddenItemIds()
            },
            deepSearch: {
                searchInside: els.deepSearchInside.checked,
                cssBackgrounds: els.deepSearchCssBackgrounds.checked,
                imageLinkHrefs: els.deepSearchImageLinks.checked,
                pdfEnabled: els.deepSearchPdfEnabled.checked
            }
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

        // Mode Tabs
        els.tabOff.classList.toggle('active', items.mode === 'off');
        els.tabBlacklist.classList.toggle('active', items.mode === 'blacklist');
        els.tabWhitelist.classList.toggle('active', items.mode === 'whitelist');

        // Lists
        setListToTextarea(els.blacklist, items.blacklist);
        setListToTextarea(els.whitelist, items.whitelist);

        // Merge settings
        const s = { ...defaultSettings.settings, ...items.settings };
        const ib = { ...defaultSettings.settings.infoBar, ...(items.settings.infoBar || {}) };
        const ds = { ...defaultSettings.settings.deepSearch, ...(items.settings.deepSearch || {}) };

        // Trigger
        Array.from(els.triggerModifierRadios).forEach(r => {
            r.checked = r.value === s.triggerModifier;
        });

        els.delay.value = s.delay;

        Array.from(els.sizeModeRadios).forEach(r => {
            r.checked = r.value === s.sizeMode;
        });

        els.originalFitToScreen.checked = s.originalFitToScreen;
        els.customSize.value = s.customSize;

        // PDF Scroll Mode
        els.pdfScrollModeRadios.forEach(r => {
            r.checked = (r.value === (s.pdfScrollMode || 'pages'));
        });

        // Info Bar
        els.infoBarEnabled.checked = ib.enabled;
        Array.from(els.infoBarPositionRadios).forEach(r => {
            r.checked = r.value === ib.position;
        });

        // Populate drag lists
        let shownItems = ib.shownItems || [...DEFAULT_INFOBAR_ORDER];
        let hiddenItems = ib.hiddenItems || [];

        const allKnown = INFO_ITEMS.map(i => i.id);
        const allPresent = [...shownItems, ...hiddenItems];
        allKnown.forEach(id => {
            if (!allPresent.includes(id)) shownItems.push(id);
        });
        shownItems = shownItems.filter(id => allKnown.includes(id));
        hiddenItems = hiddenItems.filter(id => allKnown.includes(id));

        populateDragLists(shownItems, hiddenItems);

        // Deep Search
        els.deepSearchInside.checked = ds.searchInside;
        els.deepSearchCssBackgrounds.checked = ds.cssBackgrounds;
        els.deepSearchImageLinks.checked = ds.imageLinkHrefs !== false;
        els.deepSearchPdfEnabled.checked = ds.pdfEnabled !== false;

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
            [els.tabOff, els.tabBlacklist, els.tabWhitelist].forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            updateUIState();
            scheduleSave();
        });
    };

    setupTab(els.tabOff);
    setupTab(els.tabBlacklist);
    setupTab(els.tabWhitelist);

    // Theme buttons
    els.themeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.theme);
            scheduleSave(0); // save theme instantly
        });
    });
});

// Auto-save on all relevant inputs
Array.from(els.sizeModeRadios).forEach(r => r.addEventListener('change', () => { updateUIState(); scheduleSave(); }));
els.infoBarEnabled.addEventListener('change', () => { updateUIState(); scheduleSave(); });

const autoSaveInputs = [
    els.blacklist, els.whitelist, els.delay, els.customSize,
    els.originalFitToScreen, els.infoBarEnabled,
    els.deepSearchInside, els.deepSearchCssBackgrounds,
    els.deepSearchImageLinks, els.deepSearchPdfEnabled
];
autoSaveInputs.forEach(el => {
    el.addEventListener('input', () => scheduleSave());
    el.addEventListener('change', () => scheduleSave());
});
els.pdfScrollModeRadios.forEach(el => {
    el.addEventListener('change', () => scheduleSave());
});

Array.from(els.triggerModifierRadios).forEach(r => r.addEventListener('change', () => { updateUIState(); scheduleSave(); }));
Array.from(els.infoBarPositionRadios).forEach(r => r.addEventListener('change', () => scheduleSave()));
