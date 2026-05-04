/**
 * Background Service Worker
 * Fetches PDF data on behalf of content scripts, bypassing CORS restrictions.
 * Extensions with host_permissions can fetch cross-origin resources freely.
 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'FETCH_PDF') return false;

    const url = msg.url;
    console.log('[Interactive-Previews BG] Fetching PDF:', url);

    fetch(url)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error: ${res.status} ${res.statusText}`);
            return res.arrayBuffer();
        })
        .then(buffer => {
            // Convert ArrayBuffer to plain Array so it can be JSON-serialized
            // through the message channel
            const uint8 = Array.from(new Uint8Array(buffer));
            sendResponse({ success: true, data: uint8 });
        })
        .catch(err => {
            console.warn('[Interactive-Previews BG] Fetch failed:', err.message);
            sendResponse({ success: false, error: err.message });
        });

    return true; // Keep the message channel open for async sendResponse
});
