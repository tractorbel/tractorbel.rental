import fs from 'fs';
import path from 'path';

const API = 'http://localhost:4000/api';
const token = 'dev';

async function postDocument() {
  const file = fs.readFileSync(path.join(process.cwd(), 'test.pdf'));
  const form = new FormData();
  form.append('title', 'Teste Automatizado');
  form.append('notes', 'criado pelo teste via script');
  form.append('document', new Blob([file]), 'test.pdf');

  const res = await fetch(`${API}/documents`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const txt = await res.text();
  console.log('POST status', res.status);
  console.log(txt);
  return { status: res.status, body: txt };
}

async function putDocument(id) {
  const file = fs.readFileSync(path.join(process.cwd(), 'test2.pdf'));
  const form = new FormData();
  form.append('title', 'Teste Atualizado');
  form.append('notes', 'atualizado via script');
  form.append('document', new Blob([file]), 'test2.pdf');

  const res = await fetch(`${API}/documents/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form });
  const txt = await res.text();
  console.log('PUT status', res.status);
  console.log(txt);
  return { status: res.status, body: txt };
}

async function deleteDocument(id) {
  const res = await fetch(`${API}/documents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const txt = await res.text();
  console.log('DELETE status', res.status);
  console.log(txt);
  return { status: res.status, body: txt };
}

(async function(){
  try {
    const post = await postDocument();
    let created;
    try { created = JSON.parse(post.body); } catch(e) { console.error('Failed parse POST body'); }
    if (!created || !created.id) return;
    const id = created.id;
    await putDocument(id);
    await deleteDocument(id);
    // Show manifest
    const m = await fetch(`${API}/manifest`);
    console.log('MANIFEST status', m.status);
    console.log(await m.text());
  } catch (e) {
    console.error('Script error', e);
  }
})();
