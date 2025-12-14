(function () {
    // Only run if we are NOT in an extension environment
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        console.log('Extension environment detected. Mock skipped.');
        return;
    }

    console.log('Local environment detected. Initializing mock extension APIs.');

    window.chrome = window.chrome || {};
    window.browser = window.chrome;

    // Mock chrome.runtime
    if (!chrome.runtime) {
        chrome.runtime = {
            id: 'mock-extension-id',
            lastError: null,
            getURL: (path) => path,
            sendMessage: (message, callback) => {
                console.log('Mock sendMessage:', message);
                if (callback) callback({ status: 'success', mock: true });
            },
            onMessage: {
                addListener: (callback) => {
                    console.log('Mock onMessage listener added');
                },
                removeListener: () => { }
            },
            onInstalled: {
                addListener: (callback) => {
                    console.log('Mock onInstalled listener added');
                    // trigger immediately for testing if needed
                    // callback({ reason: 'install' }); 
                }
            }
        };
    }

    // Mock chrome.storage.local using localStorage
    if (!chrome.storage) {
        chrome.storage = {};
    }

    // Mock chrome.storage.local using localStorage with in-memory fallback
    if (!chrome.storage) {
        chrome.storage = {};
    }

    if (!chrome.storage.local) {
        const memoryStorage = {};
        const getStorage = () => {
            try {
                // Check if localStorage is accessible
                localStorage.setItem('__test__', '1');
                localStorage.removeItem('__test__');
                return localStorage;
            } catch (e) {
                console.warn('localStorage not available (likely due to file:// restrictions). Using in-memory storage.');
                return {
                    getItem: (key) => memoryStorage[key] || null,
                    setItem: (key, val) => { memoryStorage[key] = val; },
                    removeItem: (key) => { delete memoryStorage[key]; },
                    clear: () => { for (let k in memoryStorage) delete memoryStorage[k]; },
                    key: (i) => Object.keys(memoryStorage)[i] || null,
                    get length() { return Object.keys(memoryStorage).length; }
                };
            }
        };

        const storage = getStorage();

        chrome.storage.local = {
            get: (keys, callback) => {
                const result = {};
                if (typeof keys === 'string') {
                    keys = [keys];
                } else if (!Array.isArray(keys) && typeof keys === 'object') {
                    const defaults = keys;
                    keys = Object.keys(defaults);
                    Object.assign(result, defaults);
                }

                if (Array.isArray(keys)) {
                    keys.forEach(key => {
                        const value = storage.getItem(key);
                        if (value !== null) {
                            try {
                                result[key] = JSON.parse(value);
                            } catch (e) {
                                result[key] = value;
                            }
                        }
                    });
                } else if (keys === null) {
                    for (let i = 0; i < storage.length; i++) {
                        const key = storage.key(i);
                        const value = storage.getItem(key);
                        try {
                            result[key] = JSON.parse(value);
                        } catch (e) {
                            result[key] = value;
                        }
                    }
                }

                if (callback) setTimeout(() => callback(result), 0);
                return new Promise(resolve => setTimeout(() => resolve(result), 0));
            },
            set: (items, callback) => {
                Object.keys(items).forEach(key => {
                    const value = items[key];
                    if (typeof value === 'string') {
                        storage.setItem(key, value);
                    } else {
                        storage.setItem(key, JSON.stringify(value));
                    }
                });
                if (callback) setTimeout(() => callback(), 0);
                return new Promise(resolve => setTimeout(() => resolve(), 0));
            },
            remove: (keys, callback) => {
                if (typeof keys === 'string') keys = [keys];
                keys.forEach(key => storage.removeItem(key));
                if (callback) setTimeout(() => callback(), 0);
                return new Promise(resolve => setTimeout(() => resolve(), 0));
            },
            clear: (callback) => {
                storage.clear();
                if (callback) setTimeout(() => callback(), 0);
                return new Promise(resolve => setTimeout(() => resolve(), 0));
            }
        };
    }

    // Mock chrome.tabs
    if (!chrome.tabs) {
        chrome.tabs = {
            query: (queryInfo, callback) => {
                console.log('Mock tabs.query:', queryInfo);
                const tabs = [{ id: 1, url: window.location.href, title: document.title }];
                if (callback) callback(tabs);
                return new Promise(resolve => resolve(tabs));
            },
            create: (createProperties, callback) => {
                console.log('Mock tabs.create:', createProperties);
                window.open(createProperties.url, '_blank');
                if (callback) callback({ id: Date.now() });
                return new Promise(resolve => resolve({ id: Date.now() }));
            },
            update: (tabId, updateProperties, callback) => {
                console.log('Mock tabs.update', tabId, updateProperties);
                if (updateProperties.url) window.location.href = updateProperties.url;
                if (callback) callback();
            }
        };
    }

    // Mock chrome.contextMenus
    if (!chrome.contextMenus) {
        chrome.contextMenus = {
            create: () => { },
            removeAll: () => { },
            onClicked: {
                addListener: () => { }
            }
        }
    }

    // Map browser to chrome if not present (for Firefox compatibility scripts)
    if (typeof window.browser === 'undefined') {
        window.browser = window.chrome;
    }

})();
