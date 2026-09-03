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

  const schoolClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function dayCycle(date = new Date(), sun = []) {
    const time = schoolClock.format(date);
    const [hour, minute, second] = time.split(':').map(Number);
    const minutes = hour * 60 + minute + second / 60;
    const period = sun.find(pair => date.getTime() >= pair[0] - 12 * 3600000 && date.getTime() <= pair[1] + 6 * 3600000);
    const phase = period ? (date.getTime() - period[0]) / (period[1] - period[0]) : (minutes - 360) / 720;
    const isDayWindow = phase >= 0 && phase <= 1;
    const solar = isDayWindow ? Math.sin(phase * Math.PI) : -0.2;
    const daylight = smoothstep(0, 0.22, solar);
    const sunriseDistance = period ? Math.abs(date.getTime() - period[0]) / 60000 : Math.abs(minutes - 360);
    const sunsetDistance = period ? Math.abs(date.getTime() - period[1]) / 60000 : Math.abs(minutes - 1080);
    const dusk = Math.max(Math.exp(-sunriseDistance / 75), Math.exp(-sunsetDistance / 75)) * (1 - solar * 0.45);
    const sunHeight = Math.max(0, solar);
    return {
      daylight,
      dusk: Math.max(0, Math.min(1, dusk)),
      sunHeight,
      sunX: Math.max(-1, Math.min(1, (phase - 0.5) * 2)),
      sunIntensity: daylight * (0.55 + sunHeight * 1.9),
      interiorFactor: 1.05 - daylight * 0.45,
      hemisphereIntensity: 0.16 + daylight * 0.56,
      label: daylight > 0.6 ? 'Gündüz' : dusk > 0.35 ? 'Gün doğumu/batımı' : 'Gece',
      time: time.slice(0, 5)
    };
  }

  return { profile, dayCycle };
});
