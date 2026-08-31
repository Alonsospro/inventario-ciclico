require('dotenv').config();
const path = require('path');

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'nibol_secret_jwt_key_2026_ciclicos_default',
  adminDeleteKey: process.env.ADMIN_DELETE_KEY || 'NIBOL2026_DELETE',

  // Google Apps Script integration endpoints
  integrations: {
    CICLICOS_URL: process.env.CICLICOS_URL || 'https://script.google.com/macros/s/AKfycbwpJ5klIWQmhhM4RNgxfG4QabqLOOb2KCVhLPhyIWvHeUsQ39wgHjMt3sHLJo9tH-9p/exec',
    BARRIDO_URL: process.env.BARRIDO_URL || 'https://script.google.com/macros/s/AKfycbysHHX9TYzpV3jDBvcDtcHmCAc0PO3vRpiivGqHz373qr4aB3mfmmcxjtWXhuemv3FyvQ/exec',
    MENSUALES_URL: process.env.MENSUALES_URL || 'https://script.google.com/macros/s/AKfycbyF903sRTv0jkn_nxAFEZogK0cY_sLSMkgJzViImuIgYMaBV_1MSI1hsINhmD43Gro4Cg/exec',
    SEMANALES_URL: process.env.SEMANALES_URL || 'https://script.google.com/macros/s/AKfycbxCEDud8PvY4nF31KusgUAa9HJvTwxTzJQsyrfBcPb1cXp4Gg9vJJh_Xo6hQ91DcgnwZw/exec'
  },

  // Base storage directory
  baseDataDir: path.join(__dirname, '..', '..', 'data'),

  // Drive logical folders naming convention
  drive: {
    baseFolder: 'NIBOL',
    ciclicosFolder: 'NIBOL/CICLICOS',
    barridoFolder: 'NIBOL/BARRIDO',
    mensualesFolder: 'NIBOL/MENSUALES',
    semanalesFolder: 'NIBOL/SEMANALES',
    justificationsPhotosFolder: 'NIBOL/FOTOS/JUSTIFICACIONES'
  },

  // Column contract definition (Cols A to P)
  columns: [
    'SKU',                // A
    'Codigo_Barras',      // B
    'Descripcion',        // C
    'Ubicacion',          // D
    'Categoria',          // E
    'Clasificacion_ABC',  // F
    'Unidad',             // G
    'Costo_Unitario',     // H (Hidden in blind count)
    'Stock_Sistema',      // I (Hidden in blind count)
    'Stock_Fisico',       // J
    'Diferencia',         // K (Hidden in blind count)
    'Costo_Diferencia',   // L (Hidden in blind count)
    'Fecha_Ultimo_Conteo',// M
    'Responsable',        // N
    'Estado',             // O (Hidden in blind count)
    'Mal_estado'          // P (Mal estado col P)
  ],

  // Hidden columns for blind count (Auxiliar role)
  blindCountHiddenCols: ['Costo_Unitario', 'Stock_Sistema', 'Diferencia', 'Costo_Diferencia', 'Estado'],

  // Allowed inventory types
  inventoryTypes: ['CICLICO', 'BARRIDO', 'MENSUAL', 'SEMANAL'],

  // Allowed centers
  centers: [
    'WARNES',
    'CENTRAL',
    'SANTA_CRUZ',
    'COCHABAMBA',
    'LA_PAZ',
    'MONTERO',
    'TARIJA',
    'YACUIBA',
    'SUCRE',
    'BENI',
    'POTOSI'
  ]
};

module.exports = config;
