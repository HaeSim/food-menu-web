// eslint-disable-next-line @typescript-eslint/no-require-imports
const { join } = require('path');

module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
