/**
 * Convert a Fabric.js Image object to a ZPL ^GFA command.
 * Threshold converts grayscale to 1-bit. Black pixels = printed dots.
 */
export function imageObjectToGFA(fabricImage, threshold = 128) {
  const el = fabricImage.getElement();
  const w = Math.round(fabricImage.width * (fabricImage.scaleX || 1));
  const h = Math.round(fabricImage.height * (fabricImage.scaleY || 1));

  if (!w || !h) return '';

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const ctx = tmpCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(el, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const rowBytes = Math.ceil(w / 8);
  let hexData = '';

  for (let row = 0; row < h; row++) {
    for (let byteIdx = 0; byteIdx < rowBytes; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const col = byteIdx * 8 + bit;
        if (col < w) {
          const i = (row * w + col) * 4;
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (data[i + 3] > 128 && gray < threshold) {
            byte |= 0x80 >> bit;
          }
        }
      }
      hexData += byte.toString(16).padStart(2, '0').toUpperCase();
    }
  }

  const totalBytes = rowBytes * h;
  return `^GFA,${totalBytes},${totalBytes},${rowBytes},${hexData}`;
}
