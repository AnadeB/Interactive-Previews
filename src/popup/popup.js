document.getElementById('open-settings').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
    } else {
        window.open(chrome.runtime.getURL('src/options/options.html'));
    }
});

const getDomain = (url) => {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return null;
    }
};

/**
 * Escape special regex characters in a string
 */
const escapeRegex = (str) => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const showStatus = (msg) => {
    const statusEl = document.getElementById('status-message');
    statusEl.textContent = msg;
    statusEl.classList.remove('hidden');
    setTimeout(() => {
        statusEl.classList.add('hidden');
    }, 2000);
};

let currentMode = 'blocklist';
let currentDomain = '';
let currentUrl = '';
let storedData = { blocklist: [], allowlist: [] };

const updateModeUI = () => {
    document.getElementById('mode-off').classList.toggle('active', currentMode === 'off');
    document.getElementById('mode-blocklist').classList.toggle('active', currentMode === 'blocklist');
    document.getElementById('mode-allowlist').classList.toggle('active', currentMode === 'allowlist');
    renderActionButtons();
};

/**
 * Check if a value exists in the list (exact string match)
 */
const isInList = (list, value) => {
    return (list || []).includes(value);
};

/**
 * Build an exact-page regex pattern from a full URL
 */
const buildPagePattern = (url) => {
    return '^' + escapeRegex(url) + '$';
};

const renderActionButtons = () => {
    const actionsDiv = document.getElementById('actions');
    actionsDiv.innerHTML = '';

    // Off mode — no actions
    if (currentMode === 'off') {
        actionsDiv.innerHTML = '<p class="actions-disabled-msg">Extension is turned off.</p>';
        return;
    }

    if (!currentDomain) {
        actionsDiv.innerHTML = '<p class="actions-disabled-msg">Cannot access this page.</p>';
        return;
    }

    const listKey = currentMode === 'blocklist' ? 'blocklist' : 'allowlist';
    const listName = currentMode === 'blocklist' ? 'Disable on' : 'Enable on';
    const list = storedData[listKey] || [];

    // --- Domain button ---
    const domainInList = isInList(list, currentDomain);
    const btnDomain = document.createElement('button');
    btnDomain.className = 'action-btn' + (domainInList ? ' remove-btn' : '');

    if (domainInList) {
        btnDomain.textContent = `Remove domain from list`;
        btnDomain.onclick = () => {
            const newList = list.filter(item => item !== currentDomain);
            chrome.storage.sync.set({ [listKey]: newList }, () => {
                storedData[listKey] = newList;
                showStatus(`Removed from list!`);
                renderActionButtons();
            });
        };
    } else {
        btnDomain.textContent = `Add domain to list`;
        btnDomain.onclick = () => {
            const newList = [...new Set([...list, currentDomain])];
            chrome.storage.sync.set({ [listKey]: newList }, () => {
                storedData[listKey] = newList;
                showStatus(`Added to list!`);
                renderActionButtons();
            });
        };
    }
    actionsDiv.appendChild(btnDomain);

    // --- Exact page button ---
    if (currentUrl) {
        const pagePattern = buildPagePattern(currentUrl);
        const pageInList = isInList(list, pagePattern);
        const btnPage = document.createElement('button');
        btnPage.className = 'action-btn' + (pageInList ? ' remove-btn' : '');

        if (pageInList) {
            btnPage.textContent = `Remove full URL from list`;
            btnPage.onclick = () => {
                const newList = list.filter(item => item !== pagePattern);
                chrome.storage.sync.set({ [listKey]: newList }, () => {
                    storedData[listKey] = newList;
                    showStatus(`Page removed!`);
                    renderActionButtons();
                });
            };
        } else {
            btnPage.textContent = `Add full URL to list`;
            btnPage.onclick = () => {
                const newList = [...new Set([...list, pagePattern])];
                chrome.storage.sync.set({ [listKey]: newList }, () => {
                    storedData[listKey] = newList;
                    showStatus(`Page added!`);
                    renderActionButtons();
                });
            };
        }
        actionsDiv.appendChild(btnPage);
    }
};

// Mode toggle buttons
const setupModeBtn = (id, mode) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
        currentMode = mode;
        chrome.storage.sync.set({ mode: currentMode });
        updateModeUI();
    });
};

setupModeBtn('mode-off', 'off');
setupModeBtn('mode-blocklist', 'blocklist');
setupModeBtn('mode-allowlist', 'allowlist');

// Init
document.addEventListener('DOMContentLoaded', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (!currentTab) return;

        currentDomain = getDomain(currentTab.url);
        currentUrl = currentTab.url || '';

        chrome.storage.sync.get({
            mode: 'blocklist',
            blocklist: [],
            allowlist: [],
            theme: 'green'
        }, (items) => {
            currentMode = items.mode || 'blocklist';
            storedData.blocklist = items.blocklist;
            storedData.allowlist = items.allowlist;

            document.documentElement.setAttribute('data-theme', items.theme || 'green');

            updateModeUI();
        });
    });
});
