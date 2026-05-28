// Open the side panel when the user clicks the extension icon
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Receive events from content scripts and store + broadcast them
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'MYT_TIMELINE_EVENT') return;

  const incoming = message.payload;

  chrome.storage.session.get('myt_events', (result) => {
    const events = result.myt_events || [];
    events.push(incoming);
    chrome.storage.session.set({ myt_events: events }, () => {
      // Broadcast to all extension views (side panel)
      chrome.runtime.sendMessage({ type: 'NEW_TIMELINE_EVENT', payload: incoming });
    });
  });

  // Return true to keep the message channel open for async response
  return true;
});
