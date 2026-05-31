// Usage: node /app/scripts/export-ues.js [ue_nums_comma_separated]
// Exemple: node /app/scripts/export-ues.js 900,901,902,903,904,905
import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

const nums = (process.argv[2] || '900,901,902,903,904,905').split(',').map(Number);
const db = new Database('/app/data/attributions.db', { readonly: true });
const placeholders = nums.map(() => '?').join(',');
const ues = db.prepare(`SELECT * FROM ue WHERE ue_num IN (${placeholders})`).all(...nums);
db.close();

if (!ues.length) { console.error('Aucune UE trouvée pour', nums); process.exit(1); }

writeFileSync('/tmp/ues_export.json', JSON.stringify(ues, null, 2));
console.log(`OK: ${ues.length} UE exportées → /tmp/ues_export.json`);
console.log('UE:', ues.map(u => `${u.ue_num} (${u.ue_nom})`).join(', '));
