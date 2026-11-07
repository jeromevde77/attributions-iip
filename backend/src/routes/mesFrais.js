/**
 * MES FRAIS (3.5.197, Charles, 7 novembre 2026 : « dans l'espace finances, je dois pouvoir compléter ce genre de documents pour
 * moi. Attention c'est confidentiel et à moi ! » ; tranché : vous seul ; le formulaire de l'ASBL rempli ; kilomètres calculés,
 * justificatifs joints, signature apposée, la note GSM chaque mois).
 *
 * Trois pièces de l'ASBL Ilya Prigogine, recomposées à l'identique de leurs modèles :
 *  - la NOTE DE FRAIS (dépense avancée par le membre du personnel ; le GSM : 20 € par mois) ;
 *  - le JUSTIFICATIF DE DÉPENSE PAYÉE PAR CARTE de l'ASBL (débit ou crédit) ;
 *  - le RELEVÉ DE FRAIS DE PARCOURS (trajets, kilomètres aller-retour calculés depuis le lieu de travail).
 *
 * CONFIDENTIEL : chaque ligne appartient à son titulaire (`user_id`) et AUCUNE route ne lit celles d'un autre — ni la direction,
 * ni l'administrateur. Les tables sont hors des traces d'annulation (lib/annulation.js, NON_TRACEES). Les justificatifs vivent
 * sous DATA_DIR/frais/<user>/. L'IBAN se garde dans le profil du titulaire, jamais dans le code.
 */
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import { kmAllerRetour } from '../lib/distanceRoute.js';
import { rendrePdf } from '../services/pdf.js';
import { signatureCourante } from '../lib/identite.js';

const r = Router();
const DATA_DIR = () => process.env.DATA_DIR || '/app/data';
const ROLES = ['admin', 'directeur', 'directeur_adjoint'];

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS frais_profil (user_id INTEGER PRIMARY KEY, prenom TEXT, nom TEXT, fonction TEXT, iban TEXT,
      depart TEXT, entite TEXT, maj_le TEXT);
    CREATE TABLE IF NOT EXISTS frais_piece (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      nature TEXT NOT NULL,                 -- note | carte | km
      date TEXT, fournisseur TEXT, montant REAL, objet TEXT, a_charge TEXT, carte TEXT, periode TEXT,
      date_piece TEXT, cree_le TEXT DEFAULT (datetime('now')), maj_le TEXT);
    CREATE TABLE IF NOT EXISTS frais_trajet (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_id INTEGER NOT NULL, date TEXT,
      depart TEXT, arrivee TEXT, entreprise TEXT, raison TEXT, a_charge TEXT, km REAL, km_calcule REAL);
    CREATE TABLE IF NOT EXISTS frais_justificatif (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_id INTEGER NOT NULL, nom TEXT,
      mime TEXT, fichier TEXT, taille INTEGER, cree_le TEXT DEFAULT (datetime('now')));
  `);
} catch (e) { console.error('[mes frais] migration', e.message); }

const garde = (req, res, next) => (ROLES.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Réservé à la direction.' }));
const sienne = (req, id) => db.prepare('SELECT * FROM frais_piece WHERE id = ? AND user_id = ?').get(Number(id), req.user.id);
const profilDe = uid => db.prepare('SELECT * FROM frais_profil WHERE user_id = ?').get(uid) || {};
const DEPART_DEFAUT = 'Route de Lennik 808, 1070 Anderlecht';

r.use(authRequired, garde);

r.get('/', (req, res) => {
  const p = profilDe(req.user.id);
  const pieces = db.prepare('SELECT * FROM frais_piece WHERE user_id = ? ORDER BY COALESCE(date, cree_le) DESC, id DESC').all(req.user.id)
    .map(x => ({ ...x,
      trajets: db.prepare('SELECT * FROM frais_trajet WHERE piece_id = ? ORDER BY date, id').all(x.id),
      justificatifs: db.prepare('SELECT id, nom, mime, taille FROM frais_justificatif WHERE piece_id = ? ORDER BY id').all(x.id) }));
  res.json({ profil: { depart: DEPART_DEFAUT, entite: 'Institut Ilya Prigogine', fonction: 'Directeur(rice)', ...p }, pieces });
});

r.put('/profil', (req, res) => {
  const b = req.body || {};
  const iban = String(b.iban || '').replace(/\s+/g, '').toUpperCase();
  if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban)) return res.status(400).json({ error: 'IBAN illisible.' });
  db.prepare(`INSERT INTO frais_profil (user_id, prenom, nom, fonction, iban, depart, entite, maj_le) VALUES (?,?,?,?,?,?,?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET prenom = excluded.prenom, nom = excluded.nom, fonction = excluded.fonction, iban = excluded.iban,
      depart = excluded.depart, entite = excluded.entite, maj_le = excluded.maj_le`)
    .run(req.user.id, b.prenom || null, b.nom || null, b.fonction || null, iban || null, b.depart || null, b.entite || null);
  res.json({ ok: true });
});

const CHAMPS = ['nature', 'date', 'fournisseur', 'montant', 'objet', 'a_charge', 'carte', 'periode', 'date_piece'];
r.post('/piece', (req, res) => {
  const b = req.body || {};
  if (!['note', 'carte', 'km'].includes(b.nature)) return res.status(400).json({ error: 'Nature : note, carte ou km.' });
  const v = CHAMPS.map(c => (b[c] === '' ? null : b[c] ?? null));
  const id = db.prepare(`INSERT INTO frais_piece (user_id, ${CHAMPS.join(', ')}) VALUES (?, ${CHAMPS.map(() => '?').join(', ')})`)
    .run(req.user.id, ...v).lastInsertRowid;
  res.json({ ok: true, id: Number(id) });
});
r.put('/piece/:id', (req, res) => {
  if (!sienne(req, req.params.id)) return res.status(404).json({ error: 'Pièce introuvable.' });
  const b = req.body || {};
  const champs = CHAMPS.filter(c => c !== 'nature' && c in b);
  if (champs.length) db.prepare(`UPDATE frais_piece SET ${champs.map(c => `${c} = ?`).join(', ')}, maj_le = datetime('now') WHERE id = ?`)
    .run(...champs.map(c => (b[c] === '' ? null : b[c])), Number(req.params.id));
  res.json({ ok: true });
});
r.delete('/piece/:id', (req, res) => {
  const p = sienne(req, req.params.id);
  if (!p) return res.status(404).json({ error: 'Pièce introuvable.' });
  for (const j of db.prepare('SELECT fichier FROM frais_justificatif WHERE piece_id = ?').all(p.id)) { try { fs.unlinkSync(j.fichier); } catch { /* */ } }
  db.prepare('DELETE FROM frais_justificatif WHERE piece_id = ?').run(p.id);
  db.prepare('DELETE FROM frais_trajet WHERE piece_id = ?').run(p.id);
  db.prepare('DELETE FROM frais_piece WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

/* LE GSM DU SEMESTRE : 20 € par mois, une note par semestre (janvier-juin, juillet-décembre), comme les notes reçues. */
r.post('/gsm', (req, res) => {
  const an = Number(req.body?.annee) || new Date().getFullYear();
  const s2 = req.body?.semestre === 2;
  const periode = s2 ? `juillet-décembre ${an}` : `janvier-juin ${an}`;
  if (db.prepare("SELECT 1 FROM frais_piece WHERE user_id = ? AND nature = 'note' AND periode = ?").get(req.user.id, periode)) {
    return res.status(409).json({ error: `La note GSM ${periode} existe déjà.` });
  }
  const mois = Number(req.body?.mois) || 6;
  const id = db.prepare(`INSERT INTO frais_piece (user_id, nature, date, fournisseur, montant, objet, a_charge, periode, date_piece)
    VALUES (?, 'note', ?, ?, ?, ?, ?, ?, date('now'))`).run(req.user.id, `${an}-${s2 ? '12' : '06'}-${s2 ? '19' : '30'}`, req.body?.fournisseur || 'Opérateur téléphonique',
      20 * mois, 'Remboursement du forfait téléphonique à concurrence de 20 € par mois.', 'Institut Ilya Prigogine', periode).lastInsertRowid;
  res.json({ ok: true, id: Number(id) });
});

/* LES TRAJETS : km aller-retour calculés depuis le lieu de travail (même service que les visites de stage) ; le chiffre tapé
   l'emporte, le calcul reste à côté. */
r.get('/km', async (req, res) => {
  const p = profilDe(req.user.id);
  const x = await kmAllerRetour(String(req.query.depart || p.depart || DEPART_DEFAUT), String(req.query.arrivee || ''));
  res.json(x);
});
r.post('/piece/:id/trajet', async (req, res) => {
  const p = sienne(req, req.params.id);
  if (!p || p.nature !== 'km') return res.status(404).json({ error: 'Relevé introuvable.' });
  const b = req.body || {};
  const depart = b.depart || profilDe(req.user.id).depart || DEPART_DEFAUT;
  let calc = null; try { calc = (await kmAllerRetour(depart, b.arrivee || '')).km_ar; } catch { /* */ }
  const km = b.km === '' || b.km == null ? calc : Number(b.km);
  const id = db.prepare(`INSERT INTO frais_trajet (piece_id, date, depart, arrivee, entreprise, raison, a_charge, km, km_calcule)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(p.id, b.date || null, depart, b.arrivee || null, b.entreprise || null, b.raison || null,
      b.a_charge || 'Entité', km, calc).lastInsertRowid;
  res.json({ ok: true, id: Number(id), km, km_calcule: calc });
});
r.put('/trajet/:tid', (req, res) => {
  const t = db.prepare('SELECT t.* FROM frais_trajet t JOIN frais_piece p ON p.id = t.piece_id WHERE t.id = ? AND p.user_id = ?').get(Number(req.params.tid), req.user.id);
  if (!t) return res.status(404).json({ error: 'Trajet introuvable.' });
  const b = req.body || {};
  const ch = ['date', 'depart', 'arrivee', 'entreprise', 'raison', 'a_charge', 'km'].filter(c => c in b);
  if (ch.length) db.prepare(`UPDATE frais_trajet SET ${ch.map(c => `${c} = ?`).join(', ')} WHERE id = ?`).run(...ch.map(c => (b[c] === '' ? null : b[c])), t.id);
  res.json({ ok: true });
});
r.delete('/trajet/:tid', (req, res) => {
  const t = db.prepare('SELECT t.id FROM frais_trajet t JOIN frais_piece p ON p.id = t.piece_id WHERE t.id = ? AND p.user_id = ?').get(Number(req.params.tid), req.user.id);
  if (!t) return res.status(404).json({ error: 'Trajet introuvable.' });
  db.prepare('DELETE FROM frais_trajet WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

/* LES JUSTIFICATIFS : PDF, JPEG ou PNG reconnus à leurs premiers octets, 10 Mo. Joints à la pièce produite. */
const TYPE = b => (b.slice(0, 4).toString('latin1') === '%PDF' ? 'application/pdf'
  : b[0] === 0xFF && b[1] === 0xD8 ? 'image/jpeg' : b.slice(1, 4).toString('latin1') === 'PNG' ? 'image/png' : null);
r.post('/piece/:id/justificatif', (req, res) => {
  const p = sienne(req, req.params.id);
  if (!p) return res.status(404).json({ error: 'Pièce introuvable.' });
  const m = /^data:[^;]*;base64,(.+)$/.exec(String(req.body?.data || ''));
  if (!m) return res.status(400).json({ error: 'Fichier attendu.' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: '10 Mo au plus.' });
  const mime = TYPE(buf);
  if (!mime) return res.status(400).json({ error: 'PDF, JPEG ou PNG seulement.' });
  const dir = path.join(DATA_DIR(), 'frais', String(req.user.id));
  fs.mkdirSync(dir, { recursive: true });
  const fichier = path.join(dir, `${p.id}-${Date.now()}`);
  fs.writeFileSync(fichier, buf);
  db.prepare('INSERT INTO frais_justificatif (piece_id, nom, mime, fichier, taille) VALUES (?,?,?,?,?)')
    .run(p.id, String(req.body?.nom || 'justificatif').slice(0, 120), mime, fichier, buf.length);
  res.json({ ok: true });
});
r.get('/justificatif/:jid', (req, res) => {
  const j = db.prepare('SELECT j.* FROM frais_justificatif j JOIN frais_piece p ON p.id = j.piece_id WHERE j.id = ? AND p.user_id = ?').get(Number(req.params.jid), req.user.id);
  if (!j) return res.status(404).end();
  res.type(j.mime).send(fs.readFileSync(j.fichier));
});
r.delete('/justificatif/:jid', (req, res) => {
  const j = db.prepare('SELECT j.* FROM frais_justificatif j JOIN frais_piece p ON p.id = j.piece_id WHERE j.id = ? AND p.user_id = ?').get(Number(req.params.jid), req.user.id);
  if (!j) return res.status(404).json({ error: 'Introuvable.' });
  try { fs.unlinkSync(j.fichier); } catch { /* */ }
  db.prepare('DELETE FROM frais_justificatif WHERE id = ?').run(j.id);
  res.json({ ok: true });
});

/* ── LA PIÈCE, RECOMPOSÉE SUR LE MODÈLE DE L'ASBL ─────────────────────────────────────────────────────────────────────────── */
const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jj = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const eur = n => (n == null ? '' : `${Number(n).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const coche = (v, l) => `<span class="cc">${v ? '☒' : '☐'} ${e(l)}</span>`;
const FONCTIONS = ['Directeur(rice)', 'Directeur(rice) adjoint(e)', 'Responsable', 'Enseignant(e)', 'Administratif(ve)'];
const ENTETE = `<div class="asbl">ILYA PRIGOGINE ASBL · NE 0458 339 252 · boulevard du Triomphe, Accès 2, CP 220/01, 1050 Bruxelles · +32 2 349 68 11</div>`;
const STYLE = `<style>@page{size:A4;margin:14mm 14mm 16mm}body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#111}
.asbl{text-align:center;font-size:8pt;border-bottom:.3mm solid #333;padding-bottom:2mm;margin-bottom:4mm}
h1{font-size:11.5pt;text-align:center;margin:0 0 4mm}h2{font-size:9.5pt;margin:4mm 0 1.5mm;text-transform:uppercase}
table.f{width:100%;border-collapse:collapse}table.f td{padding:1.2mm 1mm;vertical-align:top}table.f td.l{width:38mm;color:#333}
.v{border-bottom:.2mm dotted #555;min-height:4mm}.cc{display:inline-block;margin-right:5mm;white-space:nowrap}
table.t{width:100%;border-collapse:collapse;font-size:8.5pt}table.t th,table.t td{border:.2mm solid #555;padding:1mm 1.2mm;text-align:left}
table.t th{background:#eee}.r{text-align:right}.sig{display:flex;justify-content:space-between;margin-top:8mm}.sig div{width:45%}
.sig img{height:16mm;display:block;margin-top:1mm}.note{font-size:7.5pt;color:#444;margin-top:5mm}</style>`;

function corpsPiece(p, prof) {
  const fonction = prof.fonction || 'Directeur(rice)';
  const ident = `<h2>${p.nature === 'carte' ? 'Le titulaire de la carte' : 'Le membre du personnel'}</h2><table class="f">
    <tr><td class="l">Prénom</td><td class="v">${e(prof.prenom)}</td></tr><tr><td class="l">Nom</td><td class="v">${e(String(prof.nom || '').toUpperCase())}</td></tr>
    <tr><td class="l">Fonction</td><td>${FONCTIONS.slice(0, p.nature === 'carte' ? 3 : 5).map(f => coche(f === fonction, f)).join('')}</td></tr></table>`;
  const depense = `<h2>La dépense</h2><table class="f"><tr><td class="l">Date</td><td class="v">${jj(p.date)}${p.periode ? ` (${e(p.periode)})` : ''}</td></tr>
    <tr><td class="l">Fournisseur</td><td class="v">${e(p.fournisseur)}</td></tr><tr><td class="l">Montant EUR TTC</td><td class="v">${eur(p.montant)}</td></tr>
    <tr><td class="l">À charge de</td><td class="v">${e(p.a_charge || prof.entite || 'Institut Ilya Prigogine')}</td></tr></table>
    <h2>Objet et localisation de la dépense</h2><div class="v" style="min-height:14mm">${e(p.objet)}</div>`;
  const signatures = (gauche, droite) => `<div class="sig"><div>${gauche}<br><span style="color:#555">Date et signature</span></div>
    <div>${droite}<br>${e(prof.prenom || '')} ${e(String(prof.nom || '').toUpperCase())} · ${jj(p.date_piece || new Date().toISOString())}
    <img src="${signatureCourante()}" alt="signature"></div></div>`;
  if (p.nature === 'note') {
    return `${ENTETE}<h1>NOTE DE FRAIS destinée aux membres du personnel de la HELB et de l’IIP (PO Ilya Prigogine ASBL)</h1>${ident}${depense}
      <h2>Modalité de remboursement</h2><p>${coche(true, 'Par virement sur le compte bancaire n°')} <b>${e(prof.iban || '')}</b></p>
      ${signatures('Pour accord de l’Autorité,', 'Le membre du personnel,')}`;
  }
  if (p.nature === 'carte') {
    return `${ENTETE}<h1>Justificatif de dépense payée par carte de l’ASBL Ilya Prigogine</h1>
      <p>${coche(p.carte !== 'credit', 'Carte de débit')} ${coche(p.carte === 'credit', 'Carte de crédit (VISA)')}</p>${ident}${depense}
      ${signatures('Pour accord de l’Autorité,', 'Le titulaire de la carte,')}
      <p class="note">Formulaire recevable si dûment complété, daté, conjointement signé par l’Autorité et le titulaire de la carte et accompagné de la preuve d’achat originale. Il porte sur l’année civile et doit être introduit pour le 31 janvier de l’année n+1 au plus tard.</p>`;
  }
  const trajets = db.prepare('SELECT * FROM frais_trajet WHERE piece_id = ? ORDER BY date, id').all(p.id);
  const total = trajets.reduce((s, t) => s + (Number(t.km) || 0), 0);
  return `${ENTETE}<h1>Relevé de FRAIS DE PARCOURS destiné aux membres du personnel de la HELB et de l’IIP (PO Ilya Prigogine ASBL)</h1>
    <p><b>Le demandeur :</b> ${e(prof.prenom)} ${e(String(prof.nom || '').toUpperCase())}${prof.fonction ? `, ${e(prof.fonction)}` : ''}${p.periode ? ` — ${e(p.periode)}` : ''}</p>
    <p><b>Concerne :</b> indemnité kilométrique couvrant les frais de parcours résultant de déplacements dans le cadre de missions effectuées pour les besoins du service. L’intervention est limitée aux déplacements aller/retour du lieu de travail vers un lieu de mission et/ou d’un lieu de mission vers un lieu de mission.</p>
    <p><b>Moyen de transport :</b> véhicule motorisé personnel (trajet le plus court, kilomètres aller-retour).</p>
    <table class="t"><thead><tr><th>Date</th><th>Adresse de départ</th><th>Adresse d’arrivée</th><th>Entreprise</th><th>Raison du déplacement</th><th>À charge de</th><th class="r">KM</th></tr></thead>
    <tbody>${trajets.map(t => `<tr><td>${jj(t.date)}</td><td>${e(t.depart)}</td><td>${e(t.arrivee)}</td><td>${e(t.entreprise)}</td><td>${e(t.raison)}</td><td>${e(t.a_charge)}</td><td class="r">${t.km ?? ''}</td></tr>`).join('')}
    <tr><td colspan="6" class="r"><b>Total KM</b></td><td class="r"><b>${Math.round(total * 10) / 10}</b></td></tr></tbody></table>
    <p style="margin-top:4mm"><b>Compte bancaire du demandeur :</b> ${e(prof.iban || '')}</p>
    <p class="note">Cadre réservé au Service Finances & comptabilité : ______ km à ______ EUR/km = ______ EUR. Le montant de l’indemnité kilométrique est revu annuellement au 1er juillet (Moniteur belge).</p>
    ${signatures('Pour accord de l’Autorité,', 'Le demandeur,')}
    <p class="note">Relevé recevable si dûment complété, daté et conjointement signé par l’Autorité et le demandeur. Il porte sur l’année civile et doit être introduit pour le 31 janvier de l’année n+1 au plus tard.</p>`;
}

r.get('/piece/:id/pdf', async (req, res) => {
  const p = sienne(req, req.params.id);
  if (!p) return res.status(404).json({ error: 'Pièce introuvable.' });
  const prof = profilDe(req.user.id);
  try {
    const html = `<!doctype html><html><head><meta charset="utf-8">${STYLE}</head><body>${corpsPiece(p, prof)}</body></html>`;
    const base = await rendrePdf(html, { pageCss: true });
    // Les justificatifs, à la suite : un PDF tel quel, une image sur sa page.
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(base);
    for (const j of db.prepare('SELECT * FROM frais_justificatif WHERE piece_id = ? ORDER BY id').all(p.id)) {
      try {
        const buf = fs.readFileSync(j.fichier);
        if (j.mime === 'application/pdf') {
          const src = await PDFDocument.load(buf, { ignoreEncryption: true });
          for (const pg of await doc.copyPages(src, src.getPageIndices())) doc.addPage(pg);
        } else {
          const img = j.mime === 'image/png' ? await doc.embedPng(buf) : await doc.embedJpg(buf);
          const pg = doc.addPage([595.28, 841.89]);
          const k = Math.min(535 / img.width, 780 / img.height, 1);
          pg.drawImage(img, { x: (595.28 - img.width * k) / 2, y: (841.89 - img.height * k) / 2, width: img.width * k, height: img.height * k });
        }
      } catch (x) { console.error('[mes frais] justificatif', j.id, x.message); }
    }
    const nom = { note: 'Note_de_frais', carte: 'Justificatif_carte_ASBL', km: 'Frais_de_parcours' }[p.nature];
    res.type('application/pdf').set('Content-Disposition', `inline; filename="${nom}_${(p.date || '').slice(0, 10)}.pdf"`).send(Buffer.from(await doc.save()));
  } catch (x) { res.status(503).json({ error: `La pièce n’a pas pu être composée : ${x.message}` }); }
});

export default r;
