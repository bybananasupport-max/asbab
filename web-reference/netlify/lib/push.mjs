// Notifikasi telefon melalui Web Push. Senyap kalau kunci VAPID belum diset.
import webpush from "web-push";
import { get, put } from "./store.mjs";

export const pushReady = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export async function sendPush(title, body, url = "/") {
  if (!pushReady()) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:asbab@example.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const subs = await get("pushsubs", []);
  const keep = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(s, JSON.stringify({ title, body, url }));
      keep.push(s);
    } catch (e) {
      if (e.statusCode !== 404 && e.statusCode !== 410) keep.push(s);
    }
  }
  if (keep.length !== subs.length) await put("pushsubs", keep);
}
