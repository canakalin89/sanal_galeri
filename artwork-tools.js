// Eser sırası değişse de bağlantılar Drive dosya kimliğini kullanır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArtworkTools = api;
})(typeof window === 'undefined' ? this : window, function () {
  const validExhibition = value => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  const validArtwork = value => /^[A-Za-z0-9_-]{10,200}$/.test(value);
  function parseRoute(hash) {
    const [id, query = ''] = hash.replace(/^#/, '').split('?');
    const artworkId = new URLSearchParams(query).get('eser');
    return { id, artworkId, invalid: (!!id && !validExhibition(id)) || (artworkId !== null && (!id || !validArtwork(artworkId))) };
  }
  function artworkHash(exhibitionId, artworkId) {
    if (!validExhibition(exhibitionId) || !validArtwork(artworkId)) throw new Error('Geçersiz eser bağlantısı.');
    return '#' + exhibitionId + '?eser=' + encodeURIComponent(artworkId);
  }
  function shareUrl(base, exhibitionId, artworkId) {
    const url = new URL(base);
    url.search = ''; // Gömme ve izleme parametreleri paylaşılmaz.
    url.hash = artworkHash(exhibitionId, artworkId);
    return url.href;
  }
  function normalize(value) {
    return String(value || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').trim();
  }
  function filterImages(images, query = '', artist = '') {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return images.filter(image => (!artist || (image.artist || '').trim() === artist)
      && words.every(word => normalize([image.title, image.caption, image.artist, image.fileName].join(' ')).includes(word)));
  }
  function artists(images) {
    return [...new Set(images.map(image => (image.artist || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  }
  function pickedArtworkIndex(hits, images) {
    let object = hits[0]?.object;
    while (object && !object.userData?.imgData) object = object.parent;
    return object ? images.findIndex(image => image.id === object.userData.imgData.id) : -1;
  }
  return { parseRoute, artworkHash, shareUrl, normalize, filterImages, artists, pickedArtworkIndex };
});
