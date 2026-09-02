const fs = require('fs');

async function main() {
  const folderId = '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe';
  const url = `https://drive.google.com/drive/folders/${folderId}`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
    }
  });

  const html = await res.text();
  console.log('HTML size:', html.length);

  // Search for script tags containing AF_initDataCallback or window._DRIVE_
  const scripts = html.match(/<script[\s\S]*?<\/script>/gi) || [];
  console.log('Total scripts:', scripts.length);

  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    if (s.includes('AF_initDataCallback') || s.includes('nibol') || s.includes('svg') || s.includes(folderId)) {
      console.log(`Script ${i} matches! Length: ${s.length}`);
      // write to a debug file
      fs.writeFileSync(`./scratch/script_${i}.txt`, s);
      
      // Let's check for any 33-char drive IDs in this script
      const ids = [...s.matchAll(/([a-zA-Z0-9_-]{28,45})/g)].map(m => m[1]);
      console.log(`Script ${i} candidate IDs:`, [...new Set(ids)].filter(id => id.length >= 30).slice(0, 10));
    }
  }
}

main().catch(console.error);
