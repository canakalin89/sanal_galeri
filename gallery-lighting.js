// Mobil ve masaustu cihazlar icin dengeli 3D aydinlatma butcesi.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryLighting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function profile({ isMobile, devicePixelRatio, width, depth }) {
    const mobile = Boolean(isMobile);
    const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
    const longSide = Math.max(Number(width) || 1, Number(depth) || 1);
    return {
      pixelRatio: Math.min(ratio, mobile ? 1.35 : 1.75),
      shadowMapSize: mobile || longSide > 45 ? 1024 : 2048,
      ceilingLightCount: mobile ? 2 : Math.min(4, Math.max(2, Math.ceil(longSide / 7))),
      pointLightCount: mobile ? 1 : 3,
      shadowExtent: Math.min(32, Math.max(7, longSide / 2 + 1.5)),
      shadowRadius: mobile ? 2 : 4
    };
  }

  function smoothstep(min, max, value) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
  }

  function dayCycle(date = new Date()) {
    const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    const isDayWindow = minutes >= 360 && minutes <= 1080;
    const solar = isDayWindow ? Math.sin((minutes - 360) / 720 * Math.PI) : -0.2;
    const daylight = smoothstep(0, 0.22, solar);
    const sunriseDistance = Math.abs(minutes - 360);
    const sunsetDistance = Math.abs(minutes - 1080);
    const dusk = Math.max(Math.exp(-sunriseDistance / 75), Math.exp(-sunsetDistance / 75)) * (1 - solar * 0.45);
    const sunHeight = Math.max(0, solar);
    return {
      daylight,
      dusk: Math.max(0, Math.min(1, dusk)),
      sunHeight,
      sunX: Math.max(-1, Math.min(1, (minutes - 720) / 360)),
      sunIntensity: daylight * (0.55 + sunHeight * 1.9),
      interiorFactor: 1.05 - daylight * 0.45,
      hemisphereIntensity: 0.16 + daylight * 0.56,
      label: daylight > 0.6 ? 'Gündüz' : dusk > 0.35 ? 'Gün doğumu/batımı' : 'Gece',
      time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    };
  }

  return { profile, dayCycle };
});
