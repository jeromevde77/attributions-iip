/* Banc des pièces jointes aux idées (3.5.668). node test/suggestionsPieces.mjs */
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucie-sp-'));
process.env.DB_PATH = path.join(dir, 'test.db'); process.env.DATA_DIR = dir;
const db = (await import('../src/db/index.js')).default;
db.exec('CREATE TABLE IF NOT EXISTS utilisateur (id INTEGER PRIMARY KEY, nom_complet TEXT, email TEXT)');
const S = await import('../src/routes/suggestions.js');
S.migrerSuggestions(db);

let ok = 0, ko = 0;
const t = (nom, c, d = '') => { if (c) { ok++; console.log('  ok   ' + nom); } else { ko++; console.log('  FAUX ' + nom + (d ? '  → ' + JSON.stringify(d) : '')); } };
const url = buf => 'data:application/octet-stream;base64,' + buf.toString('base64');

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(20)]);
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(20)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(20)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(20)]);
const PDF = Buffer.from('%PDF-1.7\n…');
const ZIP = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(20)]);

t('PNG reconnu', S.typeReel(PNG) === 'image/png');
t('JPEG reconnu', S.typeReel(JPG) === 'image/jpeg');
t('GIF reconnu', S.typeReel(GIF) === 'image/gif');
t('WebP reconnu', S.typeReel(WEBP) === 'image/webp');
t('PDF reconnu', S.typeReel(PDF) === 'application/pdf');
t('Word (zip) refusé', S.typeReel(ZIP) === null);
t('un « .png » qui n\'en est pas un est refusé', !!S.lirePieces([{ nom: 'faux.png', contenu: url(Buffer.from('bonjour')) }]).erreur);
t('quatre pièces refusées', !!S.lirePieces([1, 2, 3, 4].map(() => ({ nom: 'a.png', contenu: url(PNG) }))).erreur);
t('trois pièces acceptées', S.lirePieces([1, 2, 3].map(() => ({ nom: 'a.png', contenu: url(PNG) }))).pieces?.length === 3);
const gros = Buffer.concat([PNG, Buffer.alloc(S.MAX_PIECE)]);
t('plus de 5 Mo refusé', /5 Mo/.test(S.lirePieces([{ nom: 'gros.png', contenu: url(gros) }]).erreur || ''));
t('le nom ne peut pas remonter de dossier', S.lirePieces([{ nom: '../../x.png', contenu: url(PNG) }]).pieces[0].nom.indexOf('/') < 0);

// Droits de lecture : l'auteur, la direction ; pas un autre.
db.prepare("INSERT OR IGNORE INTO utilisateur (id, nom_complet) VALUES (10, 'Thomas GUIOT')").run();
db.prepare("INSERT INTO suggestion (id, titre, auteur_id, auteur_nom) VALUES (1, 'Capture', 10, 'GUIOT Thomas')").run();
S.enregistrerPieces(1, null, S.lirePieces([{ nom: 'capture.png', contenu: url(PNG) }]).pieces, { id: 10 });
const piece = db.prepare('SELECT * FROM suggestion_piece').get();
t('pièce écrite sur le disque, pas en base', fs.existsSync(piece.chemin) && piece.chemin.startsWith(path.join(dir, 'suggestions', '1')), piece);
t('l\'auteur lit sa pièce', !!S.pieceLisible({ id: 10, role: 'professeur' }, piece.id));
t('la direction lit la pièce', !!S.pieceLisible({ id: 1, role: 'directeur' }, piece.id));
t('un autre compte ne la lit pas', !S.pieceLisible({ id: 11, role: 'secretariat' }, piece.id));
t('piecesDe la rend sans contenu', S.piecesDe(1).length === 1 && !('chemin' in S.piecesDe(1)[0]));
db.prepare('DELETE FROM suggestion WHERE id = 1').run();
t('idée retirée : la pièce reste, la direction la lit encore', fs.existsSync(piece.chemin) && !!S.pieceLisible({ id: 1, role: 'admin' }, piece.id));
t('idée retirée : l\'auteur ne la lit plus', !S.pieceLisible({ id: 10, role: 'professeur' }, piece.id));

console.log(`\n${ok} ok, ${ko} faux`); process.exit(ko ? 1 : 0);
