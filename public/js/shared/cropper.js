// Crops a photo to 3:4 for 穿搭牆: drag to position, zoom, optionally drag a cover over the face, export JPEG.
import { loadImage } from "./images.js";

const OUTPUT_WIDTH = 900; // 3:4 → 900 × 1200
const COVER_COLOUR = "#111111";

export async function createCropper(container, file) {
  const url = URL.createObjectURL(file);
  let img;
  try {
    img = await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  container.innerHTML = "<canvas></canvas>";
  const canvas = container.querySelector("canvas");
  const view = { w: 1, h: 1 }; // canvas size in CSS pixels
  let zoom = 1;
  let offset = { x: 0, y: 0 }; // image top-left in view coordinates
  let cover = null; // centre of the face cover in view coordinates, or null
  let coverScale = 1;
  let drag = null;

  const imageScale = () => Math.max(view.w / img.naturalWidth, view.h / img.naturalHeight) * zoom;
  const coverRect = () => {
    const w = view.w * 0.34 * coverScale;
    const h = view.w * 0.3 * coverScale;
    return { x: cover.x - w / 2, y: cover.y - h / 2, w, h };
  };

  function measure() {
    const width = canvas.getBoundingClientRect().width || 300;
    const ratio = view.w > 1 ? width / view.w : 1;
    offset = { x: offset.x * ratio, y: offset.y * ratio };
    if (cover) cover = { x: cover.x * ratio, y: cover.y * ratio };
    view.w = width;
    view.h = (width * 4) / 3;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clamp() {
    const s = imageScale();
    offset.x = Math.min(0, Math.max(view.w - img.naturalWidth * s, offset.x));
    offset.y = Math.min(0, Math.max(view.h - img.naturalHeight * s, offset.y));
  }

  function draw(ctx, k = 1) {
    const s = imageScale();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, view.w * k, view.h * k);
    ctx.drawImage(img, offset.x * k, offset.y * k, img.naturalWidth * s * k, img.naturalHeight * s * k);
    if (cover) {
      const r = coverRect();
      ctx.fillStyle = COVER_COLOUR;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(r.x * k, r.y * k, r.w * k, r.h * k, 14 * k);
      else ctx.rect(r.x * k, r.y * k, r.w * k, r.h * k);
      ctx.fill();
    }
  }

  const redraw = () => draw(canvas.getContext("2d"));
  const pointer = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = pointer(e);
    const r = cover && coverRect();
    drag = r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
      ? { target: "cover", dx: p.x - cover.x, dy: p.y - cover.y }
      : { target: "image", dx: p.x - offset.x, dy: p.y - offset.y };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = pointer(e);
    if (drag.target === "cover") cover = { x: p.x - drag.dx, y: p.y - drag.dy };
    else {
      offset = { x: p.x - drag.dx, y: p.y - drag.dy };
      clamp();
    }
    redraw();
  });
  const endDrag = () => (drag = null);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  const onResize = () => { measure(); clamp(); redraw(); };
  window.addEventListener("resize", onResize);

  measure();
  const s = imageScale();
  offset = { x: (view.w - img.naturalWidth * s) / 2, y: (view.h - img.naturalHeight * s) / 2 };
  redraw();

  return {
    /** z = 1 fills the frame; up to 3× */
    setZoom(z) {
      const centre = { x: view.w / 2, y: view.h / 2 };
      const before = imageScale();
      const anchor = { x: (centre.x - offset.x) / before, y: (centre.y - offset.y) / before };
      zoom = Math.max(1, Math.min(3, z));
      const after = imageScale();
      offset = { x: centre.x - anchor.x * after, y: centre.y - anchor.y * after };
      clamp();
      redraw();
    },
    /** Returns whether the cover is now shown. */
    toggleCover() {
      cover = cover ? null : { x: view.w / 2, y: view.h * 0.18 };
      redraw();
      return cover !== null;
    },
    setCoverSize(scale) {
      coverScale = scale;
      redraw();
    },
    exportJpeg() {
      const out = document.createElement("canvas");
      out.width = OUTPUT_WIDTH;
      out.height = (OUTPUT_WIDTH * 4) / 3;
      draw(out.getContext("2d"), OUTPUT_WIDTH / view.w);
      return out.toDataURL("image/jpeg", 0.85);
    },
    destroy() {
      window.removeEventListener("resize", onResize);
    },
  };
}
