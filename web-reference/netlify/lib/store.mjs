// Penyimpanan Asbab (Netlify Blobs). Setiap kunci diawali ID pengguna,
// jadi bila Asbab dibuka kepada ramai pengguna nanti, data setiap orang terasing.
import { getStore } from "@netlify/blobs";

const USER = "owner";
const db = () => getStore({ name: "asbab", consistency: "strong" });
const k = (key) => `${USER}:${key}`;

export async function get(key, fallback = null) {
  const v = await db().get(k(key), { type: "json" });
  return v ?? fallback;
}
export async function put(key, value) {
  await db().setJSON(k(key), value);
  return value;
}
export async function del(key) {
  await db().delete(k(key));
}
export async function keys(prefix = "") {
  const res = await db().list({ prefix: k(prefix) });
  return res.blobs.map((b) => b.key.slice(USER.length + 1));
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
