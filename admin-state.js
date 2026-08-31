// Tarayıcı ve kısa veri koruma testleri aynı saf dönüştürme işlevini kullanır.
(function (root) {
  function updateExhibition(exhibition, fields, rows) {
    const updated = { ...exhibition, name: fields.name, images: { ...(exhibition.images || {}) } };
    for (const key of ['description', 'year', 'class']) {
      if (fields[key]) updated[key] = fields[key]; else delete updated[key];
    }
    // Drive'da geçici olarak görünmeyen dosyaların açıklamaları silinmez.
    for (const row of rows) {
      const metadata = {};
      for (const key of ['title', 'caption', 'artist']) if (row[key]) metadata[key] = row[key];
      if (Object.keys(metadata).length) updated.images[row.id] = metadata;
      else delete updated.images[row.id];
    }
    return updated;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { updateExhibition };
  else root.GalleryAdminState = { updateExhibition };
})(typeof window === 'undefined' ? {} : window);
