const fs = require('fs');
const path = require('path');

async function main() {
  const folderId = '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe';
  const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;

  console.log('Fetching embedded folder view:', embeddedUrl);
  const res = await fetch(embeddedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });

  const html = await res.text();
  console.log('Status:', res.status, 'HTML length:', html.length);

  const entryRegex = /id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g;
  let match;
  const files = [];
  while ((match = entryRegex.exec(html)) !== null) {
    const fileId = match[1];
    const originalTitle = match[2].trim();
    files.push({ fileId, originalTitle });
  }

  console.log('Found files:', files);

  // If no entry found via flip-entry, let's search for nibol.svg in the html
  if (files.length === 0) {
    const regex2 = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/g;
    const allMatches = [...html.matchAll(regex2)].map(m => m[1]);
    console.log('Other drive IDs in html:', allMatches);
  }

  const target = files.find(f => f.originalTitle.toLowerCase().includes('nibol') || f.originalTitle.toLowerCase().endsWith('.svg')) || files[0];
  if (target) {
    console.log(`Downloading target:`, target);
    const downloadUrl = `https://drive.google.com/uc?id=${target.fileId}&export=download`;
    const dRes = await fetch(downloadUrl);
    const content = await dRes.text();
    console.log('Downloaded content length:', content.length);
    console.log('Content starts with:', content.substring(0, 200));

    // Save to public/img/nibol.svg, public/nibol.svg, and public/css/assets if needed
    const dirs = [
      path.resolve('./public'),
      path.resolve('./public/img'),
      path.resolve('./public/images')
    ];
    for (const d of dirs) {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }

    fs.writeFileSync(path.resolve('./public/nibol.svg'), content, 'utf8');
    fs.writeFileSync(path.resolve('./public/img/nibol.svg'), content, 'utf8');
    fs.writeFileSync(path.resolve('./public/images/nibol.svg'), content, 'utf8');
    console.log('Saved nibol.svg to public directories successfully!');
  }
}

main().catch(console.error);
