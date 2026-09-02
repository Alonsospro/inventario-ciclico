const fs = require('fs');

async function main() {
  const url = 'https://script.google.com/macros/s/AKfycbwpJ5klIWQmhhM4RNgxfG4QabqLOOb2KCVhLPhyIWvHeUsQ39wgHjMt3sHLJo9tH-9p/exec';
  
  // Try querying GAS webhook for folder or photo
  const testPayloads = [
    { action: 'getFile', folderId: '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe', fileName: 'nibol.svg' },
    { action: 'getFolderFiles', folderId: '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe' },
    { action: 'listFiles', folderId: '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe' }
  ];

  for (const p of testPayloads) {
    try {
      console.log('Testing GAS payload:', p.action);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      const text = await res.text();
      console.log('GAS response:', text.substring(0, 300));
    } catch (e) {
      console.warn('Error:', e.message);
    }
  }
}

main().catch(console.error);
