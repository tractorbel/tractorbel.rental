(async ()=>{
  const nodeFetch = global.fetch ? global.fetch : (await import('node-fetch')).default;
  const fetchFn = nodeFetch;

  async function getManifest(){
    const r = await fetchFn('http://localhost:4000/api/manifest');
    console.log('MANIFEST STATUS', r.status);
    try{
      const j = await r.json();
      console.log(JSON.stringify(j, null, 2));
    }catch(e){
      const t = await r.text().catch(()=>null);
      console.log('MANIFEST BODY:', t);
    }
  }

  try{
    console.log('--- MANIFEST BEFORE ---');
    await getManifest();
  }catch(e){ console.error('Error fetching manifest before:', e.message); }

  try{
    console.log('--- DELETE ---');
    const del = await fetchFn('http://localhost:4000/api/documents/organograma-rental-duque-de-caxias-rj-pdf', { method: 'DELETE', headers: { Authorization: 'Bearer dev' } });
    console.log('DELETE STATUS', del.status);
    try{
      const jd = await del.json();
      console.log(JSON.stringify(jd, null, 2));
    }catch(e){
      const t = await del.text().catch(()=>null);
      console.log('DELETE BODY:', t);
    }
  }catch(e){ console.error('Error on delete:', e.message); }

  try{
    console.log('--- MANIFEST AFTER ---');
    await getManifest();
  }catch(e){ console.error('Error fetching manifest after:', e.message); }

})();
