const fs = require('fs');

async function main() {
  const folderId = '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe';
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

  const res = await fetch(folderUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const html = await res.text();
  
  // Search for nibol case-insensitively
  const matches = [...html.matchAll(/nibol[a-zA-Z0-9_.-]*/gi)];
  console.log('Matches for nibol:', matches.map(m => m[0]));

  for (const m of matches) {
    const idx = m.index;
    const chunk = html.substring(Math.max(0, idx - 150), Math.min(html.length, idx + 150));
    console.log('--- CHUNK around', m[0], '---');
    console.log(chunk);
  }
}

main().catch(console.error);
