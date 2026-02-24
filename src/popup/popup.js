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
let storedData = { blacklist: [], whitelist: [] };

const updateModeUI = () => {
    document.getElementById('mode-blacklist').classList.toggle('active', currentMode === 'blacklist');
    document.getElementById('mode-whitelist').classList.toggle('active', currentMode === 'whitelist');
    renderActionButton();
};

const renderActionButton = () => {
    const actionsDiv = document.getElementById('actions');
    actionsDiv.innerHTML = '';

    if (!currentDomain) {
        actionsDiv.innerHTML = '<p style="color:#777; font-size:12px;">Cannot access this page.</p>';
        return;
    }

    const btn = document.createElement('button');
    btn.className = 'action-btn';

    if (currentMode === 'blacklist') {
        btn.textContent = `Add to blacklist: ${currentDomain}`;
        btn.onclick = () => {
            const newList = [...new Set([...storedData.blacklist, currentDomain])];
            chrome.storage.sync.set({ blacklist: newList }, () => {
                storedData.blacklist = newList;
                showStatus('Added to blacklist!');
            });
        };
    } else {
        btn.textContent = `Add to whitelist: ${currentDomain}`;
        btn.onclick = () => {
            const newList = [...new Set([...storedData.whitelist, currentDomain])];
            chrome.storage.sync.set({ whitelist: newList }, () => {
                storedData.whitelist = newList;
                showStatus('Added to whitelist!');
            });
        };
    }

    actionsDiv.appendChild(btn);
};

// Mode toggle buttons
document.getElementById('mode-blacklist').addEventListener('click', () => {
    currentMode = 'blacklist';
    chrome.storage.sync.set({ mode: currentMode });
    updateModeUI();
});

document.getElementById('mode-whitelist').addEventListener('click', () => {
    currentMode = 'whitelist';
    chrome.storage.sync.set({ mode: currentMode });
    updateModeUI();
});

// Init
document.addEventListener('DOMContentLoaded', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        currentDomain = getDomain(currentTab.url);

        chrome.storage.sync.get({ mode: 'blacklist', blacklist: [], whitelist: [] }, (items) => {
            currentMode = items.mode;
            storedData.blacklist = items.blacklist;
            storedData.whitelist = items.whitelist;
            updateModeUI();
        });
    });
});
