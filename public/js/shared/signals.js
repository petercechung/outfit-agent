// Sends feedback actions to the anonymous signal log (設計師洞察) in small batches.
// Only catalog item ids and the action are sent — never the person's own garments, photos or profile.
import { api } from "./api.js";

const pending = [];
let timer = null;

export function queueEvents(events) {
  pending.push(...events);
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

function flush() {
  const batch = pending.splice(0, 50);
  if (batch.length) api.events(batch).catch(() => {}); // a lost signal must never bother the person
  if (pending.length) timer = setTimeout(flush, 1500);
}
