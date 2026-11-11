/* global document */
// Pixel check for the smoke: copy the WebGL canvas (drawing buffer is preserved by counters.mjs) into a 2D canvas inside
// the page, so Node needs no image decoder and no screenshot (a screenshot waits for a paint, too slow on software GL). Returns the mean luminance (0..255), its standard deviation and the number of distinct 4-bit-per-channel
// colour buckets. A flat or empty canvas has std near 0 and 1 to 2 buckets.

export async function analyseCanvas(page) {
  return page.evaluate(() => {
    const src = document.querySelector('canvas');
    const c = document.createElement('canvas');
    c.width = src.width >> 1;
    c.height = src.height >> 1;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < px.length; i += 16) {
      const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      sum += l; sum2 += l * l; n++;
      seen.add(((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4));
    }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), buckets: seen.size };
  });
}
