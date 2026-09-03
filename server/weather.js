const { SITE } = require('../gallery-neighborhood');
const { validate, REFRESH_MS } = require('../gallery-weather');
const { HttpError } = require('./security');

function createWeatherService({ fetchImpl = (...args) => fetch(...args), now = Date.now } = {}) {
  let cached = null, cachedAt = 0, pending = null;
  return async function getWeather() {
    if (cached && now() - cachedAt < REFRESH_MS) {
      try { return validate(cached, now()); } catch { cached = null; }
    }
    if (pending) return pending;
    pending = (async () => {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({ latitude: String(SITE.latitude), longitude: String(SITE.longitude),
        current: 'temperature_2m,weather_code,cloud_cover,precipitation,rain,snowfall,wind_speed_10m,wind_direction_10m,visibility',
        daily: 'sunrise,sunset', timezone: SITE.timezone, timeformat: 'unixtime', wind_speed_unit: 'ms', forecast_days: '3' });
      try {
        const response = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Üst servis hatası');
        const data = await response.json(), c = data.current;
        if (!c || !data.daily?.sunrise?.length || !data.daily?.sunset?.length) throw new Error('Eksik hava verisi');
        const report = validate({ observedAt: c.time * 1000, fetchedAt: now(), temperature: c.temperature_2m,
          code: c.weather_code, cloudCover: c.cloud_cover, precipitation: c.precipitation, rain: c.rain, snowfall: c.snowfall,
          windSpeed: c.wind_speed_10m, windDirection: c.wind_direction_10m, visibility: c.visibility,
          sun: data.daily.sunrise.map((time,index) => [time * 1000, data.daily.sunset[index] * 1000])
        }, now());
        cached = report; cachedAt = now(); return report;
      } catch { throw new HttpError(503, 'Okulun güncel hava durumu alınamadı.'); }
    })().finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createWeatherService, getWeather: createWeatherService() };
