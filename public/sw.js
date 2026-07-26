// Presence of a fetch-handling service worker is one of Chrome's install
// criteria — this one just passes requests straight through, no caching.
self.addEventListener("fetch", () => {});
