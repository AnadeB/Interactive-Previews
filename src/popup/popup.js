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

let currentMode = 'blacklist';
let currentDomain = '';
let currentUrl = '';
let storedData = { blacklist: [], whitelist: [] };

const updateModeUI = () => {
    document.getElementById('mode-off').classList.toggle('active', currentMode === 'off');
    document.getElementById('mode-blacklist').classList.toggle('active', currentMode === 'blacklist');
    document.getElementById('mode-whitelist').classList.toggle('active', currentMode === 'whitelist');
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

    const listKey = currentMode === 'blacklist' ? 'blacklist' : 'whitelist';
    const listName = currentMode === 'blacklist' ? 'blacklist' : 'whitelist';
    const list = storedData[listKey] || [];

    // --- Domain button ---
    const domainInList = isInList(list, currentDomain);
    const btnDomain = document.createElement('button');
    btnDomain.className = 'action-btn' + (domainInList ? ' remove-btn' : '');

    if (domainInList) {
        btnDomain.textContent = `Remove domain from ${listName}`;
        btnDomain.onclick = () => {
            const newList = list.filter(item => item !== currentDomain);
            chrome.storage.sync.set({ [listKey]: newList }, () => {
                storedData[listKey] = newList;
                showStatus(`Removed from ${listName}!`);
                renderActionButtons();
            });
        };
    } else {
        btnDomain.textContent = `Add domain to ${listName}`;
        btnDomain.onclick = () => {
            const newList = [...new Set([...list, currentDomain])];
            chrome.storage.sync.set({ [listKey]: newList }, () => {
                storedData[listKey] = newList;
                showStatus(`Added to ${listName}!`);
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
            btnPage.textContent = `Remove full URL from ${listName}`;
            btnPage.onclick = () => {
                const newList = list.filter(item => item !== pagePattern);
                chrome.storage.sync.set({ [listKey]: newList }, () => {
                    storedData[listKey] = newList;
                    showStatus(`Page removed!`);
                    renderActionButtons();
                });
            };
        } else {
            btnPage.textContent = `Add full URL to ${listName}`;
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
setupModeBtn('mode-blacklist', 'blacklist');
setupModeBtn('mode-whitelist', 'whitelist');

// Init
document.addEventListener('DOMContentLoaded', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (!currentTab) return;

        currentDomain = getDomain(currentTab.url);
        currentUrl = currentTab.url || '';

        chrome.storage.sync.get({
            mode: 'blacklist',
            blacklist: [],
            whitelist: [],
            theme: 'green'
        }, (items) => {
            currentMode = items.mode;
            storedData.blacklist = items.blacklist;
            storedData.whitelist = items.whitelist;

            // Apply theme
            document.documentElement.setAttribute('data-theme', items.theme || 'green');

            updateModeUI();
        });
    });
});
