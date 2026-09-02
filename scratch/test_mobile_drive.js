const fs = require('fs');

async function main() {
  const folderId = '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe';

  // Try different user agents: Android, Googlebot, iPad, etc.
  const userAgents = [
    'Mozilla/5.0 (Android 14; Mobile; rv:123.0) Gecko/123.0 Firefox/123.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'DriveFS/68.0.0.0 (Windows 10.0; x86_64)'
  ];

  for (const ua of userAgents) {
    try {
      console.log('Testing UA:', ua.substring(0, 30));
      const res = await fetch(`https://drive.google.com/drive/folders/${folderId}`, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      const text = await res.text();
      console.log('Status:', res.status, 'Length:', text.length, 'Title:', text.match(/<title>(.*?)<\/title>/)?.[1]);
      
      const nibolIdx = text.toLowerCase().indexOf('nibol');
      if (nibolIdx !== -1) {
        console.log('Found nibol in response!');
        console.log(text.substring(nibolIdx - 50, nibolIdx + 150));
      }
    } catch(e) {
      console.warn('Error:', e.message);
    }
  }
}

main().catch(console.error);
