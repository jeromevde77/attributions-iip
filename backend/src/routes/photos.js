/* (CS) LA PHOTO D'IDENTITÉ — les routes (3.5.606, lib/photoEtudiant.js). Sans module : chaque route juge qui peut voir ou décider. */
import { Router } from 'express';
import express from 'express';
import db from '../db/index.js';
import { authRequired } from '../middleware/auth.js';
import * as P from '../lib/photoEtudiant.js';
import { rendrePdf } from '../services/pdf.js';
import { logoCourant } from '../lib/identite.js';
import { identiteEtablissement } from './config.js';

const r = Router();
P.migrerPhotos();
const admin = (req, res, next) => (P.ADMIN.includes(String(req.user?.role)) ? next() : res.status(403).json({ error: 'Réservé au secrétariat et à la direction.' }));
const nomEcran = e => `${String(e?.nom || '').toUpperCase()} ${e?.prenom || ''}`.trim();
const qui = req => req.user?.nom || req.user?.email || '?';
const anneeActive = () => db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get()?.valeur
  || db.prepare('SELECT code FROM annee_scolaire WHERE active = 1').get()?.code;
const envoyerImage = (res, p) => {
  const b = p && P.lirePhoto(p);
  if (!b) return res.status(404).json({ error: 'Pas de photo.' });
  res.setHeader('Content-Type', p.mime); res.setHeader('Cache-Control', 'private, max-age=300'); res.end(b);
};

// ── Le secrétariat valide ────────────────────────────────────────────────────
r.get('/a-valider', authRequired, admin, (req, res) => res.json(P.aValider().map(x => ({ ...x, nom: nomEcran(x) }))));
r.get('/fichier/:pid', authRequired, admin, (req, res) => envoyerImage(res, P.photoParId(req.params.pid)));
r.post('/:pid/decision', authRequired, admin, (req, res) => {
  const x = P.decider(req.params.pid, { accepter: !!req.body?.accepter, motif: req.body?.motif }, qui(req));
  if (!x.erreur) { const p = P.photoParId(req.params.pid); import('../lib/portailSync.js').then(m => m.deposerBientot?.(p.etudiant_id)).catch(() => {}); }
  res.status(x.erreur ? 400 : 200).json(x.erreur ? { error: x.erreur } : x);
});

// ── La photo d'un étudiant ───────────────────────────────────────────────────
r.get('/etudiant/:id', authRequired, async (req, res) => {
  if (!(await P.peutVoir(req.user, Number(req.params.id)))) return res.status(404).json({ error: 'Pas de photo.' });
  envoyerImage(res, P.photoCourante(req.params.id));
});
r.get('/etudiant/:id/etat', authRequired, async (req, res) => {
  if (!(await P.peutVoir(req.user, Number(req.params.id)))) return res.status(404).json({ error: 'Introuvable.' });
  const c = P.photoCourante(req.params.id), a = P.ADMIN.includes(String(req.user?.role)) ? P.photoEnAttente(req.params.id) : null;
  res.json({ courante: c ? { id: c.id, source: c.source, le: c.decide_le || c.depose_le } : null,
    attente: a ? { id: a.id, depose_le: a.depose_le } : null, peut_decider: P.ADMIN.includes(String(req.user?.role)) });
});
/* Le secrétariat dépose (ou la lecture de la carte eID) : une data URL, acceptée d'emblée. */
r.post('/etudiant/:id', authRequired, admin, express.json({ limit: '8mb' }), (req, res) => {
  const m = String(req.body?.data || '').match(/^data:image\/(jpeg|png);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'Une image JPEG ou PNG est attendue.' });
  const x = P.deposerPhoto({ etudiantId: Number(req.params.id), buffer: Buffer.from(m[2], 'base64'),
    source: req.body?.source === 'eid' ? 'eid' : 'secretariat', par: qui(req) });
  if (!x.erreur) import('../lib/portailSync.js').then(mm => mm.deposerBientot?.(Number(req.params.id))).catch(() => {});
  res.status(x.erreur ? 400 : 200).json(x.erreur ? { error: x.erreur } : x);
});

/* Retirer la photo en vigueur (3.5.712) : le secrétariat ou la direction, avec un motif. */
r.delete('/etudiant/:id', authRequired, admin, express.json(), (req, res) => {
  const motif = String(req.body?.motif || '').trim();
  if (!motif) return res.status(400).json({ error: 'Le motif du retrait est demandé.' });
  const x = P.retirerPhoto(Number(req.params.id), motif, qui(req));
  if (!x.erreur) import('../lib/portailSync.js').then(mm => mm.deposerBientot?.(Number(req.params.id))).catch(() => {});
  res.status(x.erreur ? 409 : 200).json(x.erreur ? { error: x.erreur } : x);
});

// ── Le trombinoscope d'un cours ──────────────────────────────────────────────
r.get('/cours/:cours', authRequired, async (req, res) => {
  const { accesCours } = await import('./mesCours.js');
  const a = accesCours(req, String(req.params.cours), req.query.annee || anneeActive());
  if (!a) return res.status(404).json({ error: 'Ce cours n’est pas dans vos cours.' });
  res.json({ etudiants: (a.etudiants || []).map(e => ({ id: e.id, nom: nomEcran(e), matricule: e.id_ecampus || null, groupe: e.groupe || null,
    photo: !!P.photoCourante(e.id) })).sort((x, y) => x.nom.localeCompare(y.nom, 'fr')) });
});
/* Les photos d'un cours : la même règle (l'étudiant doit être dans la liste du cours). */
r.get('/cours/:cours/etudiant/:id', authRequired, async (req, res) => {
  const { accesCours } = await import('./mesCours.js');
  const a = accesCours(req, String(req.params.cours), req.query.annee || anneeActive());
  if (!a || !(a.etudiants || []).some(e => Number(e.id) === Number(req.params.id))) return res.status(404).json({ error: 'Pas de photo.' });
  envoyerImage(res, P.photoCourante(req.params.id));
});

// ── La carte d'étudiant ──────────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
r.get('/etudiant/:id/carte', authRequired, admin, async (req, res) => {
  const e = db.prepare('SELECT id, nom, prenom, id_ecampus, date_naissance, section_rattachement FROM etudiant WHERE id = ?').get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: 'Étudiant introuvable.' });
  const p = P.photoCourante(e.id);
  if (!p) return res.status(409).json({ error: 'Pas de photo validée : la carte attend la photo.' });
  const { sectionPropre } = await import('./etudiants.js');
  const code = sectionPropre(e.id) || e.section_rattachement;
  const sec = code ? db.prepare('SELECT libelle FROM section WHERE code = ?').get(code)?.libelle || code : '';
  const annee = anneeActive();
  const id = identiteEtablissement();
  const logo = logoCourant();
  const photo = `data:${p.mime};base64,${P.lirePhoto(p).toString('base64')}`;
  const naiss = e.date_naissance ? String(e.date_naissance).slice(0, 10).split('-').reverse().join('/') : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 85.6mm 54mm; margin: 0 } * { box-sizing: border-box } body { margin: 0; font-family: Inter, 'Segoe UI', Arial, sans-serif; }
    .carte { width: 85.6mm; height: 54mm; position: relative; overflow: hidden; background: #fff; }
    .bande { position: absolute; left: 0; top: 0; right: 0; height: 11mm; background: #0E2A4F; display: flex; align-items: center; padding: 0 3.5mm; gap: 2.5mm }
    .bande img { height: 7mm } .bande .t { color: #fff; font-size: 6.6pt; font-weight: 700; letter-spacing: .4pt; text-transform: uppercase }
    .photo { position: absolute; left: 3.5mm; top: 14mm; width: 25mm; height: 32mm; object-fit: cover; border: 0.3mm solid #D8DCE4; border-radius: 1mm }
    .infos { position: absolute; left: 32mm; top: 14mm; right: 3mm; font-size: 7pt; color: #0E2A4F; line-height: 1.35 }
    .nom { font-size: 10pt; font-weight: 700; text-transform: uppercase } .prenom { font-size: 9pt; margin-bottom: 1.5mm }
    .l { color: #6B7280; font-size: 5.6pt; text-transform: uppercase; letter-spacing: .3pt; margin-top: 1.2mm }
    .pied { position: absolute; left: 0; right: 0; bottom: 0; height: 4.5mm; background: #F9B619; color: #0E2A4F; font-size: 5.8pt; font-weight: 600;
      display: flex; align-items: center; justify-content: center }
  </style></head><body><div class="carte">
    <div class="bande">${logo ? `<img src="${logo}" alt="">` : ''}<div class="t">Carte d’étudiant · ${esc(annee)}</div></div>
    <img class="photo" src="${photo}" alt="">
    <div class="infos"><div class="nom">${esc(e.nom)}</div><div class="prenom">${esc(e.prenom)}</div>
      ${naiss ? `<div class="l">Né·e le</div><div>${esc(naiss)}</div>` : ''}
      <div class="l">Matricule</div><div>${esc(e.id_ecampus || '—')}</div>
      ${sec ? `<div class="l">Section</div><div>${esc(sec)}</div>` : ''}</div>
    <div class="pied">${esc(id.nom)} — valable pour l’année ${esc(annee)}</div>
  </div></body></html>`;
  try {
    const pdf = await rendrePdf(html, { pageCss: true, pagination: 'jamais' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Carte_${String(e.nom || '').replace(/[^A-Za-z0-9]/g, '')}_${e.id}.pdf"`);
    res.end(pdf);
  } catch (x) { res.status(500).json({ error: x.message }); }
});

export default r;
