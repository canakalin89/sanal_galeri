// Ziyaretçi okumaları: aynı isteği paylaş, yalnızca doğrulanan başarıyı önbellekle.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryData = api;
})(typeof window === 'undefined' ? this : window, function () {
  const CACHE_MS = 60000;
  const TIMEOUT_MS = 15000;
  const driveId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(value);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const optionalText = (value, keys) => keys.every(key => value[key] === undefined || typeof value[key] === 'string');

  function validateCatalog(data) {
    const ids = new Set();
    if (!Array.isArray(data) || !data.every(ex => {
      if (!object(ex) || typeof ex.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ex.id) || ids.has(ex.id)) return false;
      ids.add(ex.id);
      return typeof ex.name === 'string' && ex.name.trim() && driveId(ex.driveFolderId)
        && optionalText(ex, ['description', 'year', 'class']) && object(ex.images)
        && Object.entries(ex.images).every(([id, image]) => driveId(id) && object(image) && optionalText(image, ['title', 'caption', 'artist']));
    })) throw new Error('Sergi listesi doğrulanamadı. Lütfen tekrar deneyin.');
    return data;
  }

  function validateFiles(data) {
    const ids = new Set();
    if (!object(data) || !Array.isArray(data.files) || !data.files.every(file => {
      if (!object(file) || !driveId(file.id) || ids.has(file.id)) return false;
      ids.add(file.id);
      return true;
    })) throw new Error('Eser listesi doğrulanamadı. Lütfen tekrar deneyin.');
    return data.files;
  }

  function createClient({ fetchImpl = (...args) => fetch(...args), now = Date.now, timeoutMs = TIMEOUT_MS } = {}) {
    const cache = new Map();
    const pending = new Map();
    function read(url, validate, force = false) {
      if (pending.has(url)) return pending.get(url);
      const saved = cache.get(url);
      if (!force && saved && now() - saved.time < CACHE_MS) return Promise.resolve(saved.data);
      cache.delete(url);
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin.'));
          controller.abort();
        }, timeoutMs);
      });
      const operation = Promise.resolve().then(async () => {
        const response = await fetchImpl(url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 429
          ? 'Çok fazla istek gönderildi. Biraz bekleyip tekrar deneyin.'
          : 'Sergi verileri alınamadı. Bağlantınızı kontrol edip tekrar deneyin.');
        let data;
        try { data = await response.json(); }
        catch { throw new Error('Sunucudan geçerli bir yanıt alınamadı. Lütfen tekrar deneyin.'); }
        return validate(data);
      });
      const request = Promise.race([operation, timeout]).then(data => {
        cache.set(url, { data, time: now() });
        return data;
      }).catch(error => {
        if (error instanceof TypeError) throw new Error('Bağlantı kurulamadı. İnternet bağlantınızı kontrol edin.');
        throw error;
      }).finally(() => {
        clearTimeout(timer);
        pending.delete(url);
      });
      pending.set(url, request);
      return request;
    }
    return {
      getCatalog: (force = false) => read('exhibitions.json', validateCatalog, force),
      getFiles: (folderId, force = false) => {
        if (!driveId(folderId)) return Promise.reject(new Error('Sergi klasörü geçersiz.'));
        return read('/api/drive?action=list&folderId=' + encodeURIComponent(folderId), validateFiles, force);
      }
    };
  }
  return { createClient, validateCatalog, validateFiles, CACHE_MS, TIMEOUT_MS };
});
