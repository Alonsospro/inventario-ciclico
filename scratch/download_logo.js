const fs = require('fs');
const path = require('path');

async function main() {
  const folderId = '1ZECgK7i8DAqXH0K3quRqaIlcnbpF7nSe';
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

  console.log('Fetching Google Drive folder page...');
  const res = await fetch(folderUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  const html = await res.text();
  console.log('HTML length:', html.length);

  // Search for nibol.svg and extract the associated file ID
  // In Google Drive HTML, files appear in serialized JSON data structures like:
  // ["file_id", "nibol.svg", ...] or similar
  
  const regex = /\["([a-zA-Z0-9_-]{20,})","nibol\.svg"/;
  const match1 = html.match(regex);
  
  let fileId = null;
  if (match1) {
    fileId = match1[1];
    console.log('Found fileId via pattern 1:', fileId);
  } else {
    // Try broader search around nibol.svg
    const idx = html.indexOf('nibol.svg');
    if (idx !== -1) {
      console.log('Context around nibol.svg:');
      const snippet = html.substring(Math.max(0, idx - 200), Math.min(html.length, idx + 200));
      console.log(snippet);
      
      const idMatches = [...snippet.matchAll(/([a-zA-Z0-9_-]{25,})/g)].map(m => m[1]);
      console.log('Candidate IDs in snippet:', idMatches);
      fileId = idMatches.find(id => id !== folderId) || idMatches[0];
    }
  }

  // If found, download the direct SVG content
  if (fileId) {
    console.log(`Downloading file with ID: ${fileId}`);
    const downloadUrls = [
      `https://drive.google.com/uc?id=${fileId}&export=download`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://docs.google.com/uc?id=${fileId}&export=download`
    ];

    for (const dUrl of downloadUrls) {
      try {
        console.log(`Trying ${dUrl}...`);
        const dRes = await fetch(dUrl);
        const text = await dRes.text();
        if (text.includes('<svg') || text.includes('<?xml')) {
          console.log('Successfully downloaded SVG content! Length:', text.length);
          const targetPath = path.resolve('./public/nibol.svg');
          fs.writeFileSync(targetPath, text, 'utf8');
          console.log(`Saved to ${targetPath}`);
          return;
        } else {
          console.log('Response was not SVG (length: ' + text.length + ')');
        }
      } catch (err) {
        console.warn('Error fetching url:', err.message);
      }
    }
  } else {
    console.log('Could not directly extract file ID. Extracting all string IDs from page...');
    const allMatches = [...html.matchAll(/\"([a-zA-Z0-9_-]{28,45})\"/g)].map(m => m[1]);
    const uniqueIds = [...new Set(allMatches)].filter(id => id !== folderId);
    console.log('Testing potential file IDs (first 10):', uniqueIds.slice(0, 10));

    for (const testId of uniqueIds.slice(0, 10)) {
      const dUrl = `https://drive.google.com/uc?id=${testId}&export=download`;
      try {
        const dRes = await fetch(dUrl);
        const text = await dRes.text();
        if (text.includes('<svg') || text.includes('<?xml')) {
          console.log(`FOUND SVG using ID ${testId}! Length:`, text.length);
          const targetPath = path.resolve('./public/nibol.svg');
          fs.writeFileSync(targetPath, text, 'utf8');
          console.log(`Saved to ${targetPath}`);
          return;
        }
      } catch(e) {}
    }
  }
}

main().catch(console.error);
