// Bridge: relay postMessage from interceptor (page world) to background service worker.
// Validate source === window to prevent spoofing from iframes.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.type !== 'MYT_TIMELINE_EVENT') return;

  chrome.runtime.sendMessage({
    type: 'MYT_TIMELINE_EVENT',
    payload: event.data.payload
  });
});
