// Removes a plain photo background (product shots on white or grey) so garments sit on the mannequin and
// journal like stickers. Photos whose corners don't share one background colour are returned unchanged.
import { loadImage } from "./images.js";

// H&M packshots sit on a light grey (about rgb(233,232,230)), and a white garment is only ~40 away from it.
// So the test for "is this background plain at all" is loose, while the fill that eats pixels is tight — and the
// result is checked: if the garment itself disappeared, the fill runs again stricter, then gives up on the photo.
const TOLERANCE = 34; // summed RGB distance still counted as a plain background (the corner test)
const FILL_TOLERANCE = 18; // …and the distance at which a pixel is actually erased
const STRICT_FILL_TOLERANCE = 8; // retry for pale garments, which the first pass can swallow
const MIN_GARMENT_SHARE = 0.12; // below this the picture is empty: the garment was eaten, not the background
const MAX_SIDE = 480;
const PADDING = 0.01; // kept around the garment when cropping, as a share of its longer side
const cache = new Map();

/** Resolves with a transparent PNG data URL, or the original src when the background isn't plain. */
export function cutout(src) {
  if (!src) return Promise.resolve(src);
  if (!cache.has(src)) cache.set(src, removeBackground(src).catch(() => src));
  return cache.get(src);
}

/** Swaps every <img data-cutout> inside root to its cut-out version once ready. */
export function applyCutouts(root) {
  root.querySelectorAll("img[data-cutout]").forEach((img) => {
    const original = img.getAttribute("src");
    cutout(original).then((url) => {
      if (img.getAttribute("src") === original) img.src = url;
    });
  });
}

async function removeBackground(src) {
  const img = await loadImage(src);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  const corners = [0, w - 1, (h - 1) * w, h * w - 1].map((p) => p * 4);
  const background = [0, 1, 2].map((c) => corners.reduce((sum, i) => sum + px[i + c], 0) / corners.length);
  const distance = (i) => Math.abs(px[i] - background[0]) + Math.abs(px[i + 1] - background[1]) + Math.abs(px[i + 2] - background[2]);
  if (corners.some((i) => distance(i) > TOLERANCE)) return src;

  // Flood fill from the border: only background connected to the edge becomes transparent.
  const original = new Uint8ClampedArray(px);
  const fill = (tolerance) => {
    px.set(original);
    const visited = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
    let erased = 0;
    while (stack.length) {
      const p = stack.pop();
      if (visited[p]) continue;
      visited[p] = 1;
      if (distance(p * 4) > tolerance) continue;
      px[p * 4 + 3] = 0;
      erased++;
      const x = p % w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (p >= w) stack.push(p - w);
      if (p < (h - 1) * w) stack.push(p + w);
    }
    return 1 - erased / (w * h); // what is left: the garment
  };
  if (fill(FILL_TOLERANCE) < MIN_GARMENT_SHARE && fill(STRICT_FILL_TOLERANCE) < MIN_GARMENT_SHARE) return src;
  ctx.putImageData(image, 0, 0);
  return crop(canvas, px, w, h);
}

/**
 * Trims the transparent margin, so a garment fills its frame. Packshots leave very different amounts of
 * white around the clothes, and without this the same skirt can come out half the size of another one.
 */
function crop(canvas, px, w, h) {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return canvas.toDataURL("image/png"); // nothing opaque left: keep the frame as it is
  const pad = Math.round(Math.max(maxX - minX, maxY - minY) * PADDING);
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const cropped = document.createElement("canvas");
  cropped.width = Math.min(w, maxX + pad + 1) - x0;
  cropped.height = Math.min(h, maxY + pad + 1) - y0;
  cropped.getContext("2d").drawImage(canvas, x0, y0, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped.toDataURL("image/png");
}
