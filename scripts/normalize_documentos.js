#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const MANIFEST = path.join(process.cwd(), 'documentos.json');

function parseJsonFile(p) {
  try {
    const txt = fs.readFileSync(p, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    return [];
  }
}

function getTime(item) {
  if (!item) return 0;
  const t = item.updatedAt || item.createdAt || item._ts;
  const v = Date.parse(t);
  return isNaN(v) ? 0 : v;
}

function normalize(arr) {
  if (!Array.isArray(arr)) return [];
  const map = new Map();
  for (const item of arr) {
    if (!item || !item.id) continue;
    if (!map.has(item.id)) {
      map.set(item.id, item);
      continue;
    }
    const existing = map.get(item.id);
    if (getTime(item) >= getTime(existing)) {
      map.set(item.id, item);
    }
  }
  const out = Array.from(map.values());
  out.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  return out;
}

function main() {
  const manifest = parseJsonFile(MANIFEST);
  const normalized = normalize(manifest);
  fs.writeFileSync(MANIFEST, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
}

if (require.main === module) main();
