// Open-Meteo WMO kodlarını sahne durumuna çevirir; kullanıcı konumu istenmez.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryWeather = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const REFRESH_MS = 10 * 60 * 1000, MAX_AGE_MS = 60 * 60 * 1000;
  const CODES = [0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99];
  function validate(report, now = Date.now()) {
    if (!report || !CODES.includes(report.code) || !Number.isFinite(report.observedAt) ||
      report.observedAt < now - MAX_AGE_MS || report.observedAt > now + 10 * 60 * 1000) throw new Error('Hava verisi güncel değil.');
    const ranges = { temperature: [-90,60], cloudCover: [0,100], precipitation: [0,500], rain: [0,500], snowfall: [0,100], windSpeed: [0,150], windDirection: [0,360], visibility: [0,200000] };
    for (const [key,[min,max]] of Object.entries(ranges)) if (!Number.isFinite(report[key]) || report[key] < min || report[key] > max) throw new Error('Hava verisi doğrulanamadı.');
    if (!Array.isArray(report.sun) || report.sun.length < 1 || report.sun.length > 3 || report.sun.some(pair => !Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isFinite) || pair[1] <= pair[0] || pair[1] - pair[0] > 86400000)) throw new Error('Güneş verisi doğrulanamadı.');
    return report;
  }
  function describe(report) {
    const code = report.code;
    const thunder = [95,96,99].includes(code);
    const snow = [71,73,75,77,85,86].includes(code) || report.snowfall > 0;
    const rain = !snow && ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code) || report.rain > 0 || (thunder && report.precipitation > 0));
    const fog = [45,48].includes(code);
    const intensity = Math.min(1, Math.max(0.15, snow ? report.snowfall / 0.5 : report.precipitation / 2));
    return { thunder, snow, rain, fog, intensity, cloud: Math.max(report.cloudCover / 100, thunder ? 0.95 : rain || snow ? 0.75 : 0),
      label: thunder ? 'Gök gürültülü' : snow ? 'Kar yağışlı' : rain ? 'Yağmurlu' : fog ? 'Sisli' : code === 3 ? 'Kapalı' : code > 0 ? 'Parçalı bulutlu' : 'Açık' };
  }
  return { REFRESH_MS, MAX_AGE_MS, validate, describe };
});
