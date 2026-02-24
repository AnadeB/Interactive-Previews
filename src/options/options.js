// Default settings
const defaultSettings = {
  mode: 'blacklist',
  blacklist: [],
  whitelist: [],
  settings: {
    delay: 500,
    sizeMode: 'original',
    originalFitToScreen: true,
    customSize: 512
  }
};

// UI Elements
const els = {
  modeRadios: document.getElementsByName('mode'),
  blacklistContainer: document.getElementById('blacklist-container'),
  whitelistContainer: document.getElementById('whitelist-container'),
  blacklist: document.getElementById('blacklist'),
  whitelist: document.getElementById('whitelist'),
  delay: document.getElementById('delay'),
  sizeModeRadios: document.getElementsByName('sizeMode'),

  // Sub-options containers
  subOriginal: document.getElementById('sub-original'),
  subCustom: document.getElementById('sub-custom'),

  // Inputs
  originalFitToScreen: document.getElementById('originalFitToScreen'),
  customSize: document.getElementById('customSize'),

  saveBtn: document.getElementById('save'),
  status: document.getElementById('status')
};

// Helper: Get list value from textarea
const getListFromTextarea = (textarea) => {
  return textarea.value.split('\n').filter(line => line.trim() !== '');
};

// Helper: Set textarea value from list
const setListToTextarea = (textarea, list) => {
  textarea.value = (list || []).join('\n');
};

// Toggle visibility based on interactions
const updateUIState = () => {
  console.log('[Interactive-Previews] Updating UI State...');

  // Mode Toggle (Blacklist/Whitelist)
  const selectedMode = Array.from(els.modeRadios).find(r => r.checked)?.value;
  if (selectedMode === 'blacklist') {
    els.blacklistContainer.classList.remove('hidden');
    els.whitelistContainer.classList.add('hidden');
  } else {
    els.blacklistContainer.classList.add('hidden');
    els.whitelistContainer.classList.remove('hidden');
  }

  // Size Mode Toggle
  const selectedSizeMode = Array.from(els.sizeModeRadios).find(r => r.checked)?.value;
  console.log('[Interactive-Previews] Selected Size Mode:', selectedSizeMode);

  // Reset all disabled states first
  els.subOriginal.classList.remove('disabled');
  els.originalFitToScreen.disabled = false;

  els.subCustom.classList.remove('disabled');
  els.customSize.disabled = false;

  // Apply logic
  if (selectedSizeMode === 'original') {
    // Enable Original sub-options, Disable Custom
    els.subCustom.classList.add('disabled');
    els.customSize.disabled = true;
  } else if (selectedSizeMode === 'custom') {
    // Disable Original, Enable Custom
    els.subOriginal.classList.add('disabled');
    els.originalFitToScreen.disabled = true;
  } else {
    // Viewport Mode: Disable both
    els.subOriginal.classList.add('disabled');
    els.originalFitToScreen.disabled = true;

    els.subCustom.classList.add('disabled');
    els.customSize.disabled = true;
  }
};

// Save Options
const saveOptions = () => {
  console.log('[Interactive-Previews] Saving options...');
  const settings = {
    mode: Array.from(els.modeRadios).find(r => r.checked)?.value || 'blacklist',
    blacklist: getListFromTextarea(els.blacklist),
    whitelist: getListFromTextarea(els.whitelist),
    settings: {
      delay: parseInt(els.delay.value, 10) || 0,
      sizeMode: Array.from(els.sizeModeRadios).find(r => r.checked)?.value || 'original',
      originalFitToScreen: els.originalFitToScreen.checked,
      customSize: parseInt(els.customSize.value, 10) || 512
    }
  };

  chrome.storage.sync.set(settings, () => {
    if (chrome.runtime.lastError) {
      console.error('[Interactive-Previews] Error saving options:', chrome.runtime.lastError);
      els.status.textContent = 'Error saving options.';
      els.status.style.color = 'red';
    } else {
      console.log('[Interactive-Previews] Options saved successfully.');
      els.status.textContent = 'Options saved.';
      els.status.style.color = '#27ae60';
    }

    els.status.classList.add('show');
    setTimeout(() => {
      els.status.classList.remove('show');
    }, 2000);
  });
};

// Restore Options
const restoreOptions = () => {
  console.log('[Interactive-Previews] Restoring options...');
  chrome.storage.sync.get(defaultSettings, (items) => {
    if (chrome.runtime.lastError) {
      console.error('[Interactive-Previews] Error loading options:', chrome.runtime.lastError);
      return;
    }

    console.log('[Interactive-Previews] Loaded settings:', items);

    // Mode
    Array.from(els.modeRadios).forEach(r => {
      r.checked = r.value === items.mode;
    });

    // Lists
    setListToTextarea(els.blacklist, items.blacklist);
    setListToTextarea(els.whitelist, items.whitelist);

    // General Settings
    els.delay.value = items.settings.delay;

    Array.from(els.sizeModeRadios).forEach(r => {
      r.checked = r.value === items.settings.sizeMode;
    });

    els.originalFitToScreen.checked = items.settings.originalFitToScreen;
    els.customSize.value = items.settings.customSize;

    // Trigger UI update to set initial visibility/disabled states
    updateUIState();
  });
};

// Event Listeners
document.addEventListener('DOMContentLoaded', restoreOptions);
els.saveBtn.addEventListener('click', saveOptions);

// Add change listeners for dynamic UI toggling
Array.from(els.modeRadios).forEach(r => r.addEventListener('change', updateUIState));
Array.from(els.sizeModeRadios).forEach(r => r.addEventListener('change', updateUIState));
