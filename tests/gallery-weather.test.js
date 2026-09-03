const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describe, validate, MAX_AGE_MS, REFRESH_MS } = require('../gallery-weather');
const { createWeatherService } = require('../server/weather');
const { SITE } = require('../gallery-neighborhood');
const now = Date.parse('2026-09-03T12:00:00Z');
function report(overrides = {}) {
  return { observedAt: now, temperature: 20, code: 0, cloudCover: 0, precipitation: 0,
    rain: 0, snowfall: 0, windSpeed: 3, windDirection: 90, visibility: 15000,
    sun: [[now - 8 * 3600000, now + 5 * 3600000]], ...overrides };
}
function upstream(time = now) {
  return { current: { time: time / 1000, temperature_2m: 20, weather_code: 61,
    cloud_cover: 85, precipitation: 0.5, rain: 0.5, snowfall: 0, wind_speed_10m: 3,
    wind_direction_10m: 90, visibility: 15000 }, daily: { sunrise: [(time-8*3600000)/1000], sunset: [(time+5*3600000)/1000] } };
}

test('WMO yagis kodlari yagmur, kar ve firtinayi birbirine karistirmaz', () => {
  for (const code of [51,53,55,56,57,61,63,65,66,67,80,81,82]) {
    const result = describe(report({ code }));
    assert.ok(result.rain && !result.snow && !result.thunder);
  }
  for (const code of [71,73,75,77,85,86]) {
    const result = describe(report({ code }));
    assert.ok(result.snow && !result.rain && !result.thunder);
  }
  for (const code of [95,96,99]) assert.equal(describe(report({ code, precipitation: 2 })).thunder, true);
  for (const code of [45,48]) assert.equal(describe(report({ code })).fog, true);
  const clear = describe(report());
  assert.ok(!clear.rain && !clear.snow && !clear.thunder && !clear.fog);
});

test('eski, gelecekteki veya eksik hava verisi acik hava diye sunulmaz', () => {
  assert.equal(validate(report(), now).code, 0);
  for (const invalid of [null, report({ observedAt: now-MAX_AGE_MS-1 }), report({ observedAt: now+11*60000 }),
    report({ code: 999 }), report({ rain: null }), report({ windSpeed: Infinity }), report({ sun: [] }),
    report({ sun: [[now, now-1000]] })]) assert.throws(() => validate(invalid, now));
});

test('sabit okul istegi onbellekten ve eszamanli paylasilarak gelir', async () => {
  let calls = 0, time = now;
  const service = createWeatherService({ now: () => time, fetchImpl: async (input, options) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.origin, 'https://api.open-meteo.com');
    assert.equal(url.searchParams.get('latitude'), String(SITE.latitude));
    assert.equal(url.searchParams.get('longitude'), String(SITE.longitude));
    assert.equal(url.searchParams.get('timezone'), 'Europe/Istanbul');
    assert.equal(url.searchParams.get('wind_speed_unit'), 'ms');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => upstream(time) };
  } });
  const first = await Promise.all([service(), service(), service()]);
  assert.equal(calls, 1);
  assert.equal(first[0], first[1]);
  await service(); assert.equal(calls, 1);
  time += REFRESH_MS + 1;
  const next = await service(); assert.equal(calls, 2);
  assert.equal(next.observedAt, time);
});

test('ust servis hatasinda eski basarili yanit yeniden guncelmis gibi verilmez', async () => {
  let time = now, failing = false;
  const service = createWeatherService({ now: () => time, fetchImpl: async () => {
    if (failing) throw new Error('upstream-private-details');
    return { ok: true, json: async () => upstream() };
  } });
  await service(); failing = true; time += REFRESH_MS + 1;
  await assert.rejects(service(), error => error.status === 503 && !error.message.includes('private'));
  failing = false; time = now + MAX_AGE_MS + 1;
  await assert.rejects(service(), error => error.status === 503);
});

test('hava API yazma veya baska konuma vekil istegi kabul etmez', async () => {
  const handler = require('../api/weather');
  function response() { return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.code=n; return this; }, json(body) { this.body=body; return this; } }; }
  for (const [req, code] of [[{ method: 'POST', query: {} }, 405], [{ method: 'GET', query: { latitude: 0 } }, 400]]) {
    const res = response(); await handler(req, res);
    assert.equal(res.code, code); assert.equal(res.headers['Cache-Control'], 'no-store');
  }
});
