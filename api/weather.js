const { endpoint, HttpError } = require('../server/security');
const { getWeather } = require('../server/weather');
module.exports = endpoint(async (req, res) => {
  // Konum ve üst servis sabittir; bu uç nokta genel amaçlı vekil değildir.
  if (Object.keys(req.query || {}).length) throw new HttpError(400, 'Yalnızca okulun hava durumu destekleniyor.');
  const report = await getWeather();
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600');
  return res.json(report);
}, ['GET']);
