const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const driveService = require('../src/services/driveService');
const storagePath = require('../src/services/storagePath');

test('Photo Folder Structure for Mal Estado and Justificaciones', async (t) => {
  const sampleBuffer = Buffer.from('fake-jpeg-binary-image-data-for-testing-123456');

  await t.test('Mal Estado photo path generation matches: nibol/ciclicos/fotos/malestado/{fecha}/{centro}/{sku}.jpg', () => {
    const details = driveService.getPhotoDriveDetails({
      category: 'malestado',
      sku: 'JD-AH12345',
      center: '1120',
      date: '2026-09-02',
      ext: '.jpg'
    });

    assert.strictEqual(details.category, 'malestado');
    assert.strictEqual(details.centerName, 'Volvo - Km 14');
    assert.strictEqual(details.date, '2026-09-02');
    assert.strictEqual(details.fileName, 'JD-AH12345.jpg');
    assert.strictEqual(details.folderPath, 'nibol/ciclicos/fotos/malestado/2026-09-02/Volvo - Km 14');
    assert.strictEqual(details.logicalPath, 'nibol/ciclicos/fotos/malestado/2026-09-02/Volvo - Km 14/JD-AH12345.jpg');
  });

  await t.test('Justificaciones photo path generation matches: nibol/ciclicos/fotos/justificaciones/{fecha}/{centro}/{sku}.jpg', () => {
    const details = driveService.getPhotoDriveDetails({
      category: 'justificaciones',
      sku: 'JD-RE504836',
      center: '1300',
      date: '2026-09-02',
      ext: '.png'
    });

    assert.strictEqual(details.category, 'justificaciones');
    assert.strictEqual(details.centerName, 'John Deere - Km 10');
    assert.strictEqual(details.date, '2026-09-02');
    assert.strictEqual(details.fileName, 'JD-RE504836.png');
    assert.strictEqual(details.folderPath, 'nibol/ciclicos/fotos/justificaciones/2026-09-02/John Deere - Km 10');
    assert.strictEqual(details.logicalPath, 'nibol/ciclicos/fotos/justificaciones/2026-09-02/John Deere - Km 10/JD-RE504836.png');
  });

  await t.test('Saving Mal Estado photo creates nested subfolders by date and center name', async () => {
    const saved = await driveService.savePhotoFile(sampleBuffer, 'foto_averia.jpg', 'image/jpeg', {
      category: 'malestado',
      sku: 'JD-TEST-MALESTADO-01',
      center: '1120',
      date: '2026-09-02'
    });

    assert.ok(saved);
    assert.strictEqual(saved.driveFolderPath, 'nibol/ciclicos/fotos/malestado/2026-09-02/Volvo - Km 14');
    assert.strictEqual(saved.driveFileName, 'JD-TEST-MALESTADO-01.jpg');
    assert.strictEqual(saved.driveLogicalPath, 'nibol/ciclicos/fotos/malestado/2026-09-02/Volvo - Km 14/JD-TEST-MALESTADO-01.jpg');

    // Verify structured disk folder exists
    const diskPath = path.join(storagePath.getPhotosDirectory(), 'malestado', '2026-09-02', 'Volvo - Km 14', 'JD-TEST-MALESTADO-01.jpg');
    assert.ok(fs.existsSync(diskPath), `Physical file must exist at ${diskPath}`);
    assert.strictEqual(fs.readFileSync(diskPath, 'utf8'), 'fake-jpeg-binary-image-data-for-testing-123456');

    // Verify nibol/ folder structure
    const nibolPath = path.resolve(__dirname, '..', 'nibol', 'ciclicos', 'fotos', 'malestado', '2026-09-02', 'Volvo - Km 14', 'JD-TEST-MALESTADO-01.jpg');
    assert.ok(fs.existsSync(nibolPath), `Physical file must exist at ${nibolPath}`);
  });

  await t.test('Saving Justificaciones photo creates nested subfolders by date and center name', async () => {
    const saved = await driveService.savePhotoFile(sampleBuffer, 'foto_just.jpg', 'image/jpeg', {
      category: 'justificaciones',
      sku: 'JD-TEST-JUST-99',
      center: '1300',
      date: '2026-09-02'
    });

    assert.ok(saved);
    assert.strictEqual(saved.driveFolderPath, 'nibol/ciclicos/fotos/justificaciones/2026-09-02/John Deere - Km 10');
    assert.strictEqual(saved.driveFileName, 'JD-TEST-JUST-99.jpg');
    assert.strictEqual(saved.driveLogicalPath, 'nibol/ciclicos/fotos/justificaciones/2026-09-02/John Deere - Km 10/JD-TEST-JUST-99.jpg');

    // Verify structured disk folder exists
    const diskPath = path.join(storagePath.getPhotosDirectory(), 'justificaciones', '2026-09-02', 'John Deere - Km 10', 'JD-TEST-JUST-99.jpg');
    assert.ok(fs.existsSync(diskPath), `Physical file must exist at ${diskPath}`);

    // Verify nibol/ folder structure
    const nibolPath = path.resolve(__dirname, '..', 'nibol', 'ciclicos', 'fotos', 'justificaciones', '2026-09-02', 'John Deere - Km 10', 'JD-TEST-JUST-99.jpg');
    assert.ok(fs.existsSync(nibolPath), `Physical file must exist at ${nibolPath}`);
  });

  t.after(() => {
    const photosDir = storagePath.getPhotosDirectory();
    try {
      fs.rmSync(path.join(photosDir, 'malestado', '2026-09-02'), { recursive: true, force: true });
    } catch (e) {}
    try {
      fs.rmSync(path.join(photosDir, 'justificaciones', '2026-09-02'), { recursive: true, force: true });
    } catch (e) {}
    try {
      if (fs.existsSync(photosDir)) {
        const files = fs.readdirSync(photosDir);
        files.forEach(f => {
          if (f.startsWith('PHOTO-')) {
            fs.unlinkSync(path.join(photosDir, f));
          }
        });
      }
    } catch (e) {}
    try {
      const nibolPath = path.resolve(__dirname, '..', 'nibol');
      fs.rmSync(nibolPath, { recursive: true, force: true });
    } catch (e) {}
  });
});
