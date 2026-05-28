(function () {
  // Match any MYT tracking endpoint across prod and staging environments.
  // Staging may use a different gapi subdomain, so we match on path rather than exact URL.
  const TRACK_PATH = '/v2/user_timeline/events/track';
  const MYT_DOMAIN = 'myyogateacher.com';

  // Capture native fetch before any framework code can wrap or replace it.
  // This runs at document_start, before React/Next.js initialises.
  const nativeFetch = window.fetch;

  function mytFetch(input, init) {
    if (init === undefined) init = {};
    const url = typeof input === 'string' ? input : (input && input.url);
    const isTrackingCall = url &&
      url.includes(MYT_DOMAIN) &&
      url.endsWith(TRACK_PATH) &&
      (init.method || 'GET').toUpperCase() === 'POST';

    if (isTrackingCall) {
      try {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
        if (body && body.msg_type === 'UI_EVENTS') {
          window.postMessage({ type: 'MYT_TIMELINE_EVENT', payload: body }, '*');
        }
      } catch (_) {}
    }

    return nativeFetch.apply(this, arguments);
  }

  // Use Object.defineProperty so frameworks cannot overwrite window.fetch.
  // Any assignment `window.fetch = x` silently does nothing (or throws in strict mode
  // which Next.js catches internally). Our mytFetch stays in place permanently.
  // We call nativeFetch directly — no chain, no circular reference.
  try {
    Object.defineProperty(window, 'fetch', {
      get: function () { return mytFetch; },
      set: function () {},  // silently ignore overwrites
      configurable: true,
      enumerable: true,
    });
  } catch (_) {
    // Fallback if defineProperty fails for some reason
    window.fetch = mytFetch;
  }
})();
