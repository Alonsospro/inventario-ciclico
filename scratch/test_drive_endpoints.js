const fs = require('fs');

async function main() {
  const folderId = '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe';

  // 1. Try public Drive v3 / v2 internal endpoints
  const endpoints = [
    `https://drive.google.com/drive/v2internal/viewer/items?parentId=${folderId}`,
    `https://drive.google.com/drive/v2internal/files?parentId=${folderId}`,
    `https://clients6.google.com/drive/v2internal/files?folderId=${folderId}&fields=items(id,name,title,mimeType,downloadUrl)`,
    `https://drive.google.com/drive/u/0/folders/${folderId}`,
    `https://drive.google.com/open?id=${folderId}`
  ];

  for (const ep of endpoints) {
    try {
      console.log('Testing endpoint:', ep);
      const res = await fetch(ep, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      const text = await res.text();
      console.log('Response status:', res.status, 'length:', text.length);
      if (text.includes('nibol') || text.includes('svg')) {
        console.log('Found match in endpoint:', ep);
        console.log(text.substring(0, 500));
      }
    } catch(e) {
      console.warn('Error fetching:', e.message);
    }
  }
}

main().catch(console.error);
