// ─────────────────────────────────────────────────────────────────────────────
// LES VOYAGES D'ÉTUDES (3.5.230, Charles, 8 novembre 2026 — « Procédure_voyages.docx », jusqu'ici un Word à cases). Une demande :
// le projet (titre, référent, section, dates, destination, groupe cible, participants, programme), le devis en deux parties
// (étudiants, accompagnateurs : transport, logement, activités, frais de bouche — montant × nombre), le financement (participation
// des étudiants, Conseil social, haute école : oui / non et montant), puis la validation par la direction. La liste des participants
// vient de Lucie (étudiants et membres du personnel), plus des noms libres.
// Le référent écrit sa demande tant qu'elle est en brouillon ou renvoyée ; soumise, elle attend la direction ; validée, elle se gèle
// (seule la liste des participants se complète). La coordination lit les demandes de ses sections. Chaque geste garde qui et quand.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { envelopperDocument } from '../lib/document.js';

const r = Router();
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];
const PERSONNEL = [...DIRECTION, 'secretariat', 'editeur', 'coordination', 'professeur'];
export const RUBRIQUES = { transport: 'Transport', logement: 'Logement', activite: 'Activités', bouche: 'Frais de bouche' };
const STATUTS = { brouillon: 'Brouillon', soumis: 'Soumise à la direction', valide: 'Validée', renvoye: 'Renvoyée au référent', annule: 'Annulée' };

try {
  db.exec(`CREATE TABLE IF NOT EXISTS voyage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, annee_scolaire TEXT NOT NULL, titre TEXT NOT NULL,
      referent_user_id INTEGER, referent_nom TEXT, referent_email TEXT, referent_tel TEXT, section TEXT, cursus TEXT,
      du TEXT, au TEXT, destination TEXT, groupe_cible TEXT, nb_etudiants INTEGER, nb_accompagnateurs INTEGER, programme TEXT,
      financement TEXT,                                   -- JSON { etudiants:{oui,montant}, conseil_social:{…}, he:{…}, remarques }
      statut TEXT NOT NULL DEFAULT 'brouillon', soumis_le TEXT, decide_par TEXT, decide_le TEXT, motif TEXT,
      cree_par TEXT, cree_le TEXT DEFAULT (datetime('now')), maj_le TEXT DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS voyage_ligne (
      id INTEGER PRIMARY KEY AUTOINCREMENT, voyage_id INTEGER NOT NULL, partie TEXT NOT NULL,   -- etudiants | accompagnateurs
      rubrique TEXT NOT NULL, libelle TEXT, du TEXT, au TEXT, montant REAL, nombre REAL, ordre INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS voyage_participant (
      id INTEGER PRIMARY KEY AUTOINCREMENT, voyage_id INTEGER NOT NULL, role TEXT NOT NULL,      -- etudiant | accompagnateur
      etudiant_id INTEGER, professeur_id INTEGER, nom TEXT NOT NULL, ajoute_par TEXT, ajoute_le TEXT DEFAULT (datetime('now')));`);
} catch (e) { console.error('[migration] voyages :', e.message); }

const lire = v => { try { return JSON.parse(v); } catch { return null; } };
const qui = req => req.user.nom || req.user.email;
function peutLire(req, v) {
  if (!PERSONNEL.includes(req.user.role)) return false;
  if (DIRECTION.includes(req.user.role) || ['secretariat', 'editeur'].includes(req.user.role)) return true;
  if (v.referent_user_id === req.user.id) return true;
  const secs = getUserSections(req.user);
  return req.user.role === 'coordination' && (!secs || secs.includes(v.section));
}
const peutEcrire = (req, v) => (v.referent_user_id === req.user.id || DIRECTION.includes(req.user.role)) && ['brouillon', 'renvoye'].includes(v.statut);
function complet(id) {
  const v = db.prepare('SELECT * FROM voyage WHERE id = ?').get(id); if (!v) return null;
  const lignes = db.prepare('SELECT * FROM voyage_ligne WHERE voyage_id = ? ORDER BY partie, rubrique, ordre, id').all(id);
  const participants = db.prepare('SELECT * FROM voyage_participant WHERE voyage_id = ? ORDER BY role, nom').all(id);
  const total = p => Math.round(lignes.filter(l => l.partie === p).reduce((s, l) => s + (Number(l.montant) || 0) * (Number(l.nombre) || 0), 0) * 100) / 100;
  return { ...v, financement: lire(v.financement) || {}, lignes, participants, total_etudiants: total('etudiants'), total_accompagnateurs: total('accompagnateurs'),
    total: Math.round((total('etudiants') + total('accompagnateurs')) * 100) / 100 };
}

r.get('/', authRequired, (req, res) => {
  if (!PERSONNEL.includes(req.user.role)) return res.status(403).json({ error: 'Réservé au personnel.' });
  const annee = req.query.annee || anneeDeTravail(req);
  const l = db.prepare('SELECT id FROM voyage WHERE annee_scolaire = ? ORDER BY COALESCE(du, cree_le) DESC').all(annee)
    .map(x => complet(x.id)).filter(v => peutLire(req, v));
  const sections = (() => { try { return db.prepare('SELECT code, libelle FROM section ORDER BY code').all(); } catch { return []; } })();
  res.json({ annee, voyages: l, statuts: STATUTS, rubriques: RUBRIQUES, direction: DIRECTION.includes(req.user.role), moi: req.user.id, sections });
});

const CHAMPS = ['titre', 'referent_tel', 'section', 'cursus', 'du', 'au', 'destination', 'groupe_cible', 'nb_etudiants', 'nb_accompagnateurs', 'programme'];
r.post('/', authRequired, (req, res) => {
  if (!PERSONNEL.includes(req.user.role)) return res.status(403).json({ error: 'Réservé au personnel.' });
  const titre = String(req.body?.titre || '').trim();
  if (!titre) return res.status(400).json({ error: 'Le titre du projet est requis.' });
  const id = Number(db.prepare(`INSERT INTO voyage (annee_scolaire, titre, referent_user_id, referent_nom, referent_email, cree_par) VALUES (?,?,?,?,?,?)`)
    .run(req.body?.annee || anneeDeTravail(req), titre.slice(0, 200), req.user.id, qui(req), req.user.email || null, qui(req)).lastInsertRowid);
  res.json(complet(id));
});

r.put('/:id', authRequired, (req, res) => {
  const v = db.prepare('SELECT * FROM voyage WHERE id = ?').get(Number(req.params.id));
  if (!v || !peutLire(req, v)) return res.status(404).json({ error: 'Demande introuvable.' });
  if (!peutEcrire(req, v)) return res.status(409).json({ error: v.statut === 'valide' ? 'Demande validée : elle ne se modifie plus.' : 'Demande soumise : elle attend la direction.' });
  const b = req.body || {};
  const set = CHAMPS.filter(k => b[k] !== undefined);
  const val = k => (['nb_etudiants', 'nb_accompagnateurs'].includes(k) ? (Number(b[k]) >= 0 ? Math.round(Number(b[k])) : null) : (String(b[k] ?? '').slice(0, k === 'programme' ? 5000 : 300) || null));
  db.transaction(() => {
    if (set.length) db.prepare(`UPDATE voyage SET ${set.map(k => `${k} = ?`).join(', ')}, maj_le = datetime('now') WHERE id = ?`).run(...set.map(val), v.id);
    if (b.financement) db.prepare('UPDATE voyage SET financement = ? WHERE id = ?').run(JSON.stringify(b.financement).slice(0, 4000), v.id);
    if (Array.isArray(b.lignes)) {
      db.prepare('DELETE FROM voyage_ligne WHERE voyage_id = ?').run(v.id);
      const ins = db.prepare('INSERT INTO voyage_ligne (voyage_id, partie, rubrique, libelle, du, au, montant, nombre, ordre) VALUES (?,?,?,?,?,?,?,?,?)');
      b.lignes.slice(0, 80).forEach((l, i) => {
        if (!['etudiants', 'accompagnateurs'].includes(l.partie) || !RUBRIQUES[l.rubrique]) return;
        ins.run(v.id, l.partie, l.rubrique, String(l.libelle || '').slice(0, 200) || null, l.du || null, l.au || null,
          Number(l.montant) || 0, Number(l.nombre) || 0, i);
      });
    }
  })();
  res.json(complet(v.id));
});

r.post('/:id/soumettre', authRequired, (req, res) => {
  const v = complet(Number(req.params.id));
  if (!v || !peutLire(req, v)) return res.status(404).json({ error: 'Demande introuvable.' });
  if (!peutEcrire(req, v)) return res.status(409).json({ error: 'Cette demande n’est plus en brouillon.' });
  const manque = [!v.du || !v.au ? 'les dates' : null, !v.destination ? 'la destination' : null, !v.section ? 'la section' : null,
    !v.nb_etudiants ? 'le nombre d’étudiants' : null, !v.lignes.length ? 'le devis' : null].filter(Boolean);
  if (manque.length) return res.status(409).json({ error: `À compléter avant de soumettre : ${manque.join(', ')}.` });
  db.prepare(`UPDATE voyage SET statut = 'soumis', soumis_le = datetime('now') WHERE id = ?`).run(v.id);
  try {
    db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_role, cree_par) VALUES ('voyage', ?, ?, '/organisation?onglet=voyages', 'admin', ?)`)
      .run(`Voyage d'études à valider — ${v.titre}`, `${v.section || ''} · ${v.destination || ''} · ${v.total.toFixed(2)} €`, qui(req));
  } catch { /* */ }
  res.json(complet(v.id));
});

r.post('/:id/decider', authRequired, (req, res) => {
  if (!DIRECTION.includes(req.user.role)) return res.status(403).json({ error: 'Réservé à la direction.' });
  const v = db.prepare('SELECT * FROM voyage WHERE id = ?').get(Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'Demande introuvable.' });
  const d = req.body?.decision;
  if (!['valide', 'renvoye', 'annule'].includes(d)) return res.status(400).json({ error: 'Décision inconnue.' });
  const motif = String(req.body?.motif || '').trim() || null;
  if (d !== 'valide' && !motif) return res.status(400).json({ error: 'Un mot pour le référent.' });
  if (d === 'valide' && v.statut !== 'soumis') return res.status(409).json({ error: 'Seule une demande soumise se valide.' });
  db.prepare(`UPDATE voyage SET statut = ?, decide_par = ?, decide_le = datetime('now'), motif = ? WHERE id = ?`).run(d, qui(req), motif, v.id);
  try {
    if (v.referent_user_id) db.prepare(`INSERT INTO lucie_notification (type, titre, corps, lien, cible_user_id, cree_par) VALUES ('voyage', ?, ?, '/organisation?onglet=voyages', ?, ?)`)
      .run(`Voyage « ${v.titre} » : ${STATUTS[d].toLowerCase()}`, motif || `Par ${qui(req)}.`, v.referent_user_id, qui(req));
  } catch { /* */ }
  res.json(complet(v.id));
});

// LES PARTICIPANTS : étudiants et personnel de Lucie, ou un nom libre ; ils se complètent même après validation.
r.post('/:id/participants', authRequired, (req, res) => {
  const v = db.prepare('SELECT * FROM voyage WHERE id = ?').get(Number(req.params.id));
  if (!v || !peutLire(req, v)) return res.status(404).json({ error: 'Demande introuvable.' });
  if (!(v.referent_user_id === req.user.id || DIRECTION.includes(req.user.role) || ['secretariat', 'editeur'].includes(req.user.role))) return res.status(403).json({ error: 'Réservé au référent, au secrétariat et à la direction.' });
  const ins = db.prepare('INSERT INTO voyage_participant (voyage_id, role, etudiant_id, professeur_id, nom, ajoute_par) VALUES (?,?,?,?,?,?)');
  let n = 0;
  for (const p of (Array.isArray(req.body?.participants) ? req.body.participants : []).slice(0, 300)) {
    const role = p.role === 'accompagnateur' ? 'accompagnateur' : 'etudiant';
    let nom = String(p.nom || '').trim();
    if (p.etudiant_id) { const e = db.prepare('SELECT nom, prenom FROM etudiant WHERE id = ?').get(Number(p.etudiant_id)); if (!e) continue; nom = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(); }
    if (p.professeur_id) { const e = db.prepare('SELECT nom, prenom FROM professeur WHERE id = ?').get(Number(p.professeur_id)); if (!e) continue; nom = `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(); }
    if (!nom) continue;
    const deja = db.prepare('SELECT 1 FROM voyage_participant WHERE voyage_id = ? AND ((? IS NOT NULL AND etudiant_id = ?) OR (? IS NOT NULL AND professeur_id = ?) OR nom = ?)').get(v.id, p.etudiant_id || null, p.etudiant_id || null, p.professeur_id || null, p.professeur_id || null, nom);
    if (deja) continue;
    ins.run(v.id, role, Number(p.etudiant_id) || null, Number(p.professeur_id) || null, nom.slice(0, 150), qui(req)); n++;
  }
  res.json({ ajoutes: n, ...complet(v.id) });
});
r.delete('/:id/participants/:pid', authRequired, (req, res) => {
  const v = db.prepare('SELECT * FROM voyage WHERE id = ?').get(Number(req.params.id));
  if (!v || !peutLire(req, v)) return res.status(404).json({ error: 'Demande introuvable.' });
  if (!(v.referent_user_id === req.user.id || DIRECTION.includes(req.user.role) || ['secretariat', 'editeur'].includes(req.user.role))) return res.status(403).json({ error: 'Refusé.' });
  db.prepare('DELETE FROM voyage_participant WHERE id = ? AND voyage_id = ?').run(Number(req.params.pid), v.id);
  res.json(complet(v.id));
});
// Les étudiants proposables : ceux de la section du voyage (inscrits cette année), filtrés par nom.
r.get('/:id/etudiants', authRequired, (req, res) => {
  const v = db.prepare('SELECT * FROM voyage WHERE id = ?').get(Number(req.params.id));
  if (!v || !peutLire(req, v)) return res.status(404).json({ error: 'Demande introuvable.' });
  const q = `%${String(req.query.q || '').trim()}%`;
  const l = db.prepare(`SELECT DISTINCT e.id, e.nom, e.prenom, e.section_rattachement AS section FROM etudiant e JOIN etudiant_inscription i ON i.etudiant_id = e.id
    WHERE i.annee_scolaire = ? AND (? = '' OR e.section_rattachement = ?) AND (e.nom || ' ' || COALESCE(e.prenom, '')) LIKE ?
    ORDER BY e.nom COLLATE NOCASE, e.prenom COLLATE NOCASE LIMIT 400`).all(v.annee_scolaire, req.query.toutes ? '' : (v.section || ''), v.section || '', q);
  res.json(l.map(e => ({ id: e.id, nom: `${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim(), section: e.section })));
});

r.get('/:id/document', authRequired, (req, res) => {
  const v = complet(Number(req.params.id));
  if (!v || !peutLire(req, v)) return res.status(404).json({ error: 'Demande introuvable.' });
  const esc = x => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
  const eur = n => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`;
  const devis = partie => {
    const ls = v.lignes.filter(l => l.partie === partie);
    if (!ls.length) return '<p class="fin">Aucune ligne.</p>';
    return `<table class="serre"><thead><tr><th>Rubrique</th><th>Détail</th><th>Du</th><th>Au</th><th class="n">Tarif</th><th class="n">Nombre</th><th class="n">Total</th></tr></thead><tbody>
      ${ls.map(l => `<tr><td>${esc(RUBRIQUES[l.rubrique])}</td><td>${esc(l.libelle || '')}</td><td>${fr(l.du)}</td><td>${fr(l.au)}</td><td class="n">${eur(l.montant)}</td><td class="n">${esc(l.nombre)}</td><td class="n">${eur((l.montant || 0) * (l.nombre || 0))}</td></tr>`).join('')}
      <tr class="total"><td colspan="6"><b>Total</b></td><td class="n"><b>${eur(partie === 'etudiants' ? v.total_etudiants : v.total_accompagnateurs)}</b></td></tr></tbody></table>`;
  };
  const f = v.financement || {};
  const fin = (k, l) => `<tr><td>${l}</td><td>${f[k]?.oui ? '☒ oui ☐ non' : '☐ oui ☒ non'}</td><td class="n">${f[k]?.oui ? eur(f[k]?.montant) : ''}</td></tr>`;
  const validation = `<table class="serre"><tr><th style="width:50%">Validation par le demandeur</th><th>Validation par la direction</th></tr>
    <tr><td>${esc(v.referent_nom || '')}${v.soumis_le ? `, soumise le ${fr(v.soumis_le)}` : ''}</td><td>${v.statut === 'valide' ? `Validée le ${fr(v.decide_le)} par ${esc(v.decide_par)}` : esc(STATUTS[v.statut])}${v.motif ? ` — ${esc(v.motif)}` : ''}</td></tr></table>`;
  const corps = `
    <h2>${esc(v.titre)}</h2>
    <table class="serre">
      <tr><th style="width:45mm">Référent du dossier</th><td>${esc(v.referent_nom || '')} · ${esc(v.referent_email || '')}${v.referent_tel ? ` · ${esc(v.referent_tel)}` : ''}</td></tr>
      <tr><th>Section · cursus</th><td>${esc(v.section || '')}${v.cursus ? ` · ${esc(v.cursus)}` : ''}</td></tr>
      <tr><th>Dates</th><td>du ${fr(v.du)} au ${fr(v.au)}</td></tr>
      <tr><th>Destination</th><td>${esc(v.destination || '')}</td></tr>
      <tr><th>Groupe cible</th><td>${esc(v.groupe_cible || '')}</td></tr>
      <tr><th>Participants</th><td>${v.nb_etudiants ?? '—'} étudiant(s) · ${v.nb_accompagnateurs ?? '—'} accompagnateur(s)</td></tr>
      <tr><th>Programme</th><td>${esc(v.programme || '').replace(/\n/g, '<br>')}</td></tr></table>
    <h3>Devis — partie 1 : étudiants</h3>${devis('etudiants')}
    <h3>Devis — partie 2 : accompagnateurs</h3>${devis('accompagnateurs')}
    <h3>Financement</h3>
    <table class="serre"><thead><tr><th>Participation</th><th>Oui / non</th><th class="n">Montant</th></tr></thead><tbody>
      ${fin('etudiants', 'Étudiants')}${fin('conseil_social', 'Conseil social')}${fin('he', 'Haute école')}
      <tr class="total"><td colspan="2"><b>Coût global</b></td><td class="n"><b>${eur(v.total)}</b></td></tr></tbody></table>
    ${f.remarques ? `<p><b>Remarques :</b> ${esc(f.remarques)}</p>` : ''}
    <h3>Validation</h3>${validation}
    <h3 style="break-before:page;page-break-before:always">Liste des participants</h3>
    ${v.participants.length ? `<table class="serre"><thead><tr><th class="n">N°</th><th>Nom et prénom</th><th>Qualité</th></tr></thead><tbody>
      ${v.participants.map((p, i) => `<tr><td class="n">${i + 1}</td><td>${esc(p.nom)}</td><td>${p.role === 'accompagnateur' ? 'accompagnateur' : 'étudiant'}</td></tr>`).join('')}</tbody></table>` : '<p class="fin">Liste à compléter.</p>'}`;
  res.json({ html: envelopperDocument({ html: corps, titre: 'Voyage d’études', entete: { titre: `Voyage d’études — ${v.annee_scolaire}`, sous: v.titre } }),
    titre: 'Voyage d’études', nom: `Voyage-${String(v.titre).replace(/[^\w-]+/g, '-').slice(0, 40)}-${v.annee_scolaire}.html` });
});

export default r;
