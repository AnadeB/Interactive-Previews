// ===== Info Bar Item Definitions =====
const INFO_ITEMS = [
  { id: 'dimensions', label: 'Original Dimensions', example: 'ex: 1920×1080' },
  { id: 'name', label: 'File Name', example: 'ex: photo.jpg' },
  { id: 'extension', label: 'Extension', example: 'ex: PNG' },
  { id: 'fileSize', label: 'File Size', example: 'ex: 245 KB' },
  { id: 'mimeType', label: 'MIME Type', example: 'ex: image/webp' },
  { id: 'aspectRatio', label: 'Aspect Ratio', example: 'ex: 16:9' }
];

const DEFAULT_INFOBAR_ORDER = INFO_ITEMS.map(i => i.id); // all shown by default

// Default settings
const defaultSettings = {
  mode: 'blacklist',
  blacklist: [],
  whitelist: [],
  settings: {
    delay: 500,
    triggerModifier: 'none',
    sizeMode: 'original',
    originalFitToScreen: true,
    customSize: 512,
    infoBar: {
      enabled: false,
      position: 'top',
      shownItems: [...DEFAULT_INFOBAR_ORDER],  // ordered list of shown item ids
      hiddenItems: []                           // ordered list of hidden item ids
    },
    deepSearch: {
      searchInside: true,
      cssBackgrounds: true
    }
  }
};

// ===== Saved snapshot for change detection =====
let savedSnapshot = '';

// ===== UI Elements =====
const els = {
  modeRadios: document.getElementsByName('mode'),
  blacklistContainer: document.getElementById('blacklist-container'),
  whitelistContainer: document.getElementById('whitelist-container'),
  blacklist: document.getElementById('blacklist'),
  whitelist: document.getElementById('whitelist'),
  delay: document.getElementById('delay'),
  sizeModeRadios: document.getElementsByName('sizeMode'),

  subOriginal: document.getElementById('sub-original'),
  subCustom: document.getElementById('sub-custom'),
  originalFitToScreen: document.getElementById('originalFitToScreen'),
  customSize: document.getElementById('customSize'),

  triggerModifierRadios: document.getElementsByName('triggerModifier'),

  infoBarEnabled: document.getElementById('infoBarEnabled'),
  infoBarPositionRadios: document.getElementsByName('infoBarPosition'),
  infoBarSuboptions: document.getElementById('infobar-suboptions'),
  activeList: document.getElementById('infobar-items-active'),
  hiddenList: document.getElementById('infobar-items-hidden'),

  deepSearchInside: document.getElementById('deepSearchInside'),
  deepSearchCssBackgrounds: document.getElementById('deepSearchCssBackgrounds'),

  saveBtn: document.getElementById('save'),
  saveHint: document.getElementById('save-hint'),
  status: document.getElementById('status')
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

  // Drag events
  el.addEventListener('dragstart', (e) => {
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', itemId);
  });

  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
    clearAllIndicators();
    checkForChanges();
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
    // Only clear if actually leaving the list
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

    checkForChanges();
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

// ===== Change detection =====
function getCurrentSnapshot() {
  const settings = {
    mode: Array.from(els.modeRadios).find(r => r.checked)?.value || 'blacklist',
    blacklist: getListFromTextarea(els.blacklist),
    whitelist: getListFromTextarea(els.whitelist),
    settings: {
      delay: els.delay.value,
      triggerModifier: Array.from(els.triggerModifierRadios).find(r => r.checked)?.value || 'none',
      sizeMode: Array.from(els.sizeModeRadios).find(r => r.checked)?.value || 'original',
      originalFitToScreen: els.originalFitToScreen.checked,
      customSize: els.customSize.value,
      infoBar: {
        enabled: els.infoBarEnabled.checked,
        position: Array.from(els.infoBarPositionRadios).find(r => r.checked)?.value || 'top',
        shownItems: getShownItemIds(),
        hiddenItems: getHiddenItemIds()
      },
      deepSearch: {
        searchInside: els.deepSearchInside.checked,
        cssBackgrounds: els.deepSearchCssBackgrounds.checked
      }
    }
  };
  return JSON.stringify(settings);
}

function checkForChanges() {
  const current = getCurrentSnapshot();
  const hasChanges = current !== savedSnapshot;

  if (hasChanges) {
    els.saveBtn.classList.remove('outline');
    els.saveHint.textContent = "Don't forget to save your changes!";
    els.saveHint.classList.add('has-changes');
    els.saveHint.classList.remove('saved');
  } else {
    els.saveBtn.classList.add('outline');
    if (!els.saveHint.classList.contains('saved')) {
      els.saveHint.textContent = 'No changes';
    }
    els.saveHint.classList.remove('has-changes');
  }
}

// ===== Toggle visibility based on interactions =====
const updateUIState = () => {
  // Mode Toggle
  const selectedMode = Array.from(els.modeRadios).find(r => r.checked)?.value;
  if (selectedMode === 'off') {
    els.blacklistContainer.classList.add('hidden');
    els.whitelistContainer.classList.add('hidden');
  } else if (selectedMode === 'blacklist') {
    els.blacklistContainer.classList.remove('hidden');
    els.whitelistContainer.classList.add('hidden');
  } else {
    els.blacklistContainer.classList.add('hidden');
    els.whitelistContainer.classList.remove('hidden');
  }

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

  // Info Bar — disable sub-options when master is off
  const infoEnabled = els.infoBarEnabled.checked;
  if (infoEnabled) {
    els.infoBarSuboptions.classList.remove('disabled');
  } else {
    els.infoBarSuboptions.classList.add('disabled');
  }

  // Toggle disabled state on position radios
  Array.from(els.infoBarPositionRadios).forEach(el => {
    el.disabled = !infoEnabled;
  });

  checkForChanges();
};

// ===== Save Options =====
const saveOptions = () => {
  const settings = {
    mode: Array.from(els.modeRadios).find(r => r.checked)?.value || 'blacklist',
    blacklist: getListFromTextarea(els.blacklist),
    whitelist: getListFromTextarea(els.whitelist),
    settings: {
      delay: parseInt(els.delay.value, 10) || 0,
      triggerModifier: Array.from(els.triggerModifierRadios).find(r => r.checked)?.value || 'none',
      sizeMode: Array.from(els.sizeModeRadios).find(r => r.checked)?.value || 'original',
      originalFitToScreen: els.originalFitToScreen.checked,
      customSize: parseInt(els.customSize.value, 10) || 512,
      infoBar: {
        enabled: els.infoBarEnabled.checked,
        position: Array.from(els.infoBarPositionRadios).find(r => r.checked)?.value || 'top',
        shownItems: getShownItemIds(),
        hiddenItems: getHiddenItemIds()
      },
      deepSearch: {
        searchInside: els.deepSearchInside.checked,
        cssBackgrounds: els.deepSearchCssBackgrounds.checked
      }
    }
  };

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      console.error('[Interactive-Previews] Error saving options:', chrome.runtime.lastError);
      els.status.textContent = 'Error saving options.';
      els.status.style.color = 'red';
    } else {
      console.log('[Interactive-Previews] Options saved successfully.');
      // Update snapshot after successful save
      savedSnapshot = getCurrentSnapshot();
      // Show saved state
      els.saveBtn.classList.add('outline');
      els.saveHint.textContent = 'Changes saved!';
      els.saveHint.classList.remove('has-changes');
      els.saveHint.classList.add('saved');
    }

    els.status.classList.add('show');
    setTimeout(() => {
      els.status.classList.remove('show');
    }, 2000);
  });
};

// ===== Restore Options =====
const restoreOptions = () => {
  chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
      console.error('[Interactive-Previews] Error loading options:', chrome.runtime.lastError);
      return;
    }

    // Mode
    Array.from(els.modeRadios).forEach(r => {
      r.checked = r.value === items.mode;
    });

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

    // Info Bar
    els.infoBarEnabled.checked = ib.enabled;
    Array.from(els.infoBarPositionRadios).forEach(r => {
      r.checked = r.value === ib.position;
    });

    // Populate drag lists
    let shownItems = ib.shownItems || [...DEFAULT_INFOBAR_ORDER];
    let hiddenItems = ib.hiddenItems || [];

    // Ensure all items are present (handle upgrades from old format)
    const allKnown = INFO_ITEMS.map(i => i.id);
    const allPresent = [...shownItems, ...hiddenItems];
    allKnown.forEach(id => {
      if (!allPresent.includes(id)) {
        shownItems.push(id);
      }
    });
    // Remove unknown items
    shownItems = shownItems.filter(id => allKnown.includes(id));
    hiddenItems = hiddenItems.filter(id => allKnown.includes(id));

    populateDragLists(shownItems, hiddenItems);

    // Deep Search
    els.deepSearchInside.checked = ds.searchInside;
    els.deepSearchCssBackgrounds.checked = ds.cssBackgrounds;

    updateUIState();

    // Take initial snapshot AFTER all values are set
    savedSnapshot = getCurrentSnapshot();
    checkForChanges();
  });
};

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
  // Setup drag-and-drop zones
  setupDropZone(els.activeList);
  setupDropZone(els.hiddenList);

  restoreOptions();
});

els.saveBtn.addEventListener('click', saveOptions);

// Change listeners for UI toggling + change detection
Array.from(els.modeRadios).forEach(r => r.addEventListener('change', updateUIState));
Array.from(els.sizeModeRadios).forEach(r => r.addEventListener('change', updateUIState));
els.infoBarEnabled.addEventListener('change', updateUIState);

// Change detection on all inputs
const watchChangeOn = [
  els.blacklist, els.whitelist, els.delay, els.customSize,
  els.originalFitToScreen, els.infoBarEnabled,
  els.deepSearchInside, els.deepSearchCssBackgrounds
];
watchChangeOn.forEach(el => {
  el.addEventListener('input', checkForChanges);
  el.addEventListener('change', checkForChanges);
});
Array.from(els.triggerModifierRadios).forEach(r => r.addEventListener('change', checkForChanges));
Array.from(els.infoBarPositionRadios).forEach(r => r.addEventListener('change', checkForChanges));
