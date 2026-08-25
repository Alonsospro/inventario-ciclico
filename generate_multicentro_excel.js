const excelService = require('./services/excelService');
const path = require('path');

async function main() {
  console.log('--- GENERANDO EXCEL MULTICENTRO CON 13 PESTAÑAS ---');
  const targetPath = path.join(__dirname, 'data', 'inventario_muestra.xlsx');
  await excelService.createSampleInventoryExcel(targetPath);
  console.log(`✓ Archivo Excel generado con éxito en: ${targetPath}`);

  // Inspect the generated workbook
  const info = await excelService.inspectWorkbook(targetPath);
  console.log(`✓ Total de pestañas generadas: ${info.sheetCount}`);
  info.sheets.forEach(s => {
    console.log(`   - Pestaña: [${s.name}] (${s.rowCount} artículos)`);
  });
}

main().catch(console.error);
