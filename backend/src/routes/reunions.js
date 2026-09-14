// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Réunions d'équipe et tâches de suivi
//
// CE QUI SE DÉCIDE EN RÉUNION DOIT SURVIVRE À LA RÉUNION. Un ordre du jour se
// prépare dans un traitement de texte, les décisions se notent sur un carnet,
// et quinze jours plus tard on rouvre la séance en demandant « où en
// est-on ? » — à quoi personne ne peut répondre, parce que rien ne relie ce
// qui a été dit à ce qui a été fait.
//
// Une réunion porte donc ses points, ses présents et ses tâches ; une tâche
// porte son responsable, son échéance et son statut, et sait de quelle séance
// elle vient. Rouvrir une réunion, c'est retrouver ce qui reste ouvert.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { envelopperDocument } from '../lib/document.js';

const r = Router();

/** L'année de travail, celle des écrans, sans la redemander à chaque appel. */
function anneeDeTravail(req) {
  if (req.query?.annee) return req.query.annee;
  if (req.body?.annee) return req.body.annee;
  const l = db.prepare(
    "SELECT valeur FROM lucie_config WHERE cle = 'annee_active'").get();
  return l?.valeur
    || db.prepare('SELECT MAX(annee_scolaire) AS a FROM attribution').get()?.a
    || '';
}

const qui = req => req.user?.nom_complet || req.user?.email || 'inconnu';

/**
 * À QUI PEUT-ON CONFIER UNE TÂCHE.
 *
 * La liste des utilisateurs est réservée à l'administrateur — c'est juste, elle
 * porte les courriels, les droits et les dates de connexion. Mais pour confier
 * une tâche il ne faut qu'un nom et un rôle : cette porte-là ne donne que cela,
 * et seulement des comptes actifs.
 */
r.get('/personnes', authRequired, (req, res) => {
  // LE PERSONNEL D'ABORD, LES COMPTES ENSUITE. On convoque et l'on charge des
  // PERSONNES ; le compte Lucie ne dit que si elles peuvent se connecter. Ne
  // proposer que les comptes rendait la moitié de l'équipe inassignable — et
  // les enseignants, qui n'en ont pas, invisibles.
  const personnel = db.prepare(`
    SELECT p.id, p.nom, p.prenom, p.statut,
           (SELECT u.id FROM utilisateur u WHERE u.professeur_id = p.id AND u.actif = 1)
             AS user_id
      FROM professeur p ORDER BY p.nom, p.prenom
  `).all().map(p => ({
    cle: p.user_id ? `u:${p.user_id}` : `p:${p.id}`,
    professeur_id: p.id, user_id: p.user_id || null,
    nom: `${p.prenom} ${p.nom}`, statut: p.statut || null, source: 'personnel',
  }));

  // Les comptes sans fiche — l'administrateur technique, par exemple — restent
  // joignables : ils tiennent des tâches, eux aussi.
  const sansFiche = db.prepare(`
    SELECT id, nom_complet AS nom, role FROM utilisateur
     WHERE actif = 1 AND (professeur_id IS NULL
        OR professeur_id NOT IN (SELECT id FROM professeur))
     ORDER BY nom_complet
  `).all().map(u => ({
    cle: `u:${u.id}`, user_id: u.id, professeur_id: null,
    nom: u.nom, role: u.role, source: 'compte',
  }));

  res.json([...personnel, ...sansFiche]);
});

/**
 * LES OBLIGATIONS DE L'ANNÉE, pour y raccrocher une action.
 *
 * L'échéancier porte ce que la circulaire et le décret imposent : une date, un
 * libellé, une base légale. Une réunion de service, elle, décide du TRAVAIL qui
 * permettra de les tenir. Tant que les deux restaient étrangers, on avait d'un
 * côté un registre d'obligations que personne ne rattachait à une action, et de
 * l'autre des actions dont plus personne ne savait pourquoi on les faisait.
 */
r.get('/obligations', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  res.json(db.prepare(`
    SELECT e.id, e.date_due, e.statut,
           COALESCE(e.libelle_override, t.libelle) AS libelle,
           t.base_legale, t.categorie, t.zone
      FROM echeance e JOIN echeance_type t ON t.id = e.type_id
     WHERE e.annee_scolaire = ? AND e.statut NOT IN ('annule','sans_objet')
     ORDER BY e.date_due
  `).all(annee));
});

// ─── LES TÂCHES ─────────────────────────────────────────────────────────────

const SELECT_TACHE = `
  SELECT t.*,
         COALESCE(u.nom_complet, pr.prenom || ' ' || pr.nom) AS responsable_nom,
         r.titre AS reunion_titre, r.date_seance AS reunion_date,
         COALESCE(e.libelle_override, et.libelle) AS obligation_libelle,
         et.base_legale AS obligation_base, e.date_due AS obligation_date
    FROM tache t
    LEFT JOIN utilisateur u  ON u.id  = t.responsable_user_id
    LEFT JOIN professeur  pr ON pr.id = t.responsable_professeur_id
    LEFT JOIN reunion r      ON r.id  = t.reunion_id
    LEFT JOIN echeance e     ON e.id  = t.echeance_id
    LEFT JOIN echeance_type et ON et.id = e.type_id
`;

/**
 * GET /taches — filtres : annee, statut, responsable_user_id, mien, reunion_id,
 * ouvertes=1 (tout ce qui n'est ni fait ni abandonné).
 */
r.get('/taches', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  let sql = SELECT_TACHE + ' WHERE t.annee_scolaire = ?';
  const p = [annee];
  if (req.query.statut) { sql += ' AND t.statut = ?'; p.push(req.query.statut); }
  if (req.query.ouvertes === '1') sql += " AND t.statut IN ('a_faire','en_cours')";
  if (req.query.reunion_id) { sql += ' AND t.reunion_id = ?'; p.push(Number(req.query.reunion_id)); }
  if (req.query.responsable_user_id) {
    sql += ' AND t.responsable_user_id = ?'; p.push(Number(req.query.responsable_user_id));
  }
  // « Les miennes » : ce qui m'est confié nommément ET ce qui l'est à mon rôle.
  // Ne retenir que le nom laisserait de côté « le secrétariat fait X », qui est
  // pourtant ma tâche si je suis au secrétariat.
  if (req.query.mien === '1') {
    sql += ` AND (t.responsable_user_id = ? OR t.responsable_role = ?
                  OR (t.responsable_professeur_id IS NOT NULL
                      AND t.responsable_professeur_id = (
                        SELECT professeur_id FROM utilisateur WHERE id = ?)))`;
    p.push(req.user.id, req.user.role, req.user.id);
  }
  // L'ordre d'une liste de tâches n'est pas l'ordre de création : ce qui est en
  // retard d'abord, puis ce qui vient, puis ce qui n'a pas de date.
  sql += ` ORDER BY CASE WHEN t.statut IN ('fait','abandonnee') THEN 1 ELSE 0 END,
                    CASE WHEN t.echeance IS NULL THEN 1 ELSE 0 END,
                    t.echeance, t.priorite DESC, t.id`;
  res.json(db.prepare(sql).all(...p));
});

r.post('/taches', authRequired, (req, res) => {
  const b = req.body || {};
  if (!b.titre || !String(b.titre).trim()) {
    return res.status(400).json({ error: 'Une tâche sans intitulé ne se suit pas.' });
  }
  const info = db.prepare(`
    INSERT INTO tache (annee_scolaire, titre, detail, responsable_user_id,
                       responsable_professeur_id,
                       responsable_role, echeance, statut, priorite, reunion_id,
                       echeance_id, cree_par, maj_le)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))
  `).run(anneeDeTravail(req), String(b.titre).trim(), b.detail || null,
    b.responsable_user_id || null, b.responsable_professeur_id || null,
    b.responsable_role || null,
    b.echeance || null, b.statut || 'a_faire',
    Number.isInteger(b.priorite) ? b.priorite : 1,
    b.reunion_id || null, b.echeance_id || null, qui(req));
  res.json(db.prepare(SELECT_TACHE + ' WHERE t.id = ?').get(info.lastInsertRowid));
});

r.put('/taches/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tache WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'tâche inconnue' });
  const b = req.body || {};
  const v = (k, d) => (b[k] === undefined ? d : b[k]);

  // FAIT SE DATE, ET SE SIGNE. Une tâche cochée sans trace ne vaut pas mieux
  // qu'une tâche effacée : au point suivant, on ne sait plus qui l'a close.
  const devientFaite = b.statut === 'fait' && t.statut !== 'fait';
  const redevientOuverte = b.statut && b.statut !== 'fait' && t.statut === 'fait';

  db.prepare(`
    UPDATE tache SET titre=?, detail=?, responsable_user_id=?,
      responsable_professeur_id=?, responsable_role=?,
      echeance=?, statut=?, priorite=?, commentaire=?, reunion_id=?,
      revue_reunion_id=?, echeance_id=?, fait_le=?, fait_par=?, maj_le=datetime('now')
    WHERE id=?
  `).run(
    v('titre', t.titre), v('detail', t.detail),
    v('responsable_user_id', t.responsable_user_id),
    v('responsable_professeur_id', t.responsable_professeur_id),
    v('responsable_role', t.responsable_role),
    v('echeance', t.echeance), v('statut', t.statut),
    v('priorite', t.priorite), v('commentaire', t.commentaire),
    v('reunion_id', t.reunion_id), v('revue_reunion_id', t.revue_reunion_id),
    v('echeance_id', t.echeance_id),
    devientFaite ? new Date().toISOString().slice(0, 10)
      : redevientOuverte ? null : t.fait_le,
    devientFaite ? qui(req) : redevientOuverte ? null : t.fait_par,
    req.params.id);

  res.json(db.prepare(SELECT_TACHE + ' WHERE t.id = ?').get(req.params.id));
});

// Supprimer une tâche reste possible — une tâche créée par erreur n'a pas à
// polluer le suivi —, mais c'est réservé à la direction : ailleurs, on
// l'abandonne, ce qui laisse une trace.
r.delete('/taches/:id', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
    db.prepare('DELETE FROM tache WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

// ─── LES RÉUNIONS ───────────────────────────────────────────────────────────

r.get('/', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const lignes = db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM tache t WHERE t.reunion_id = r.id) AS nb_taches,
      (SELECT COUNT(*) FROM tache t WHERE t.reunion_id = r.id
         AND t.statut IN ('a_faire','en_cours')) AS nb_ouvertes
    FROM reunion r WHERE r.annee_scolaire = ?
    ORDER BY r.date_seance DESC, r.id DESC
  `).all(annee);
  res.json(lignes);
});

r.get('/:id', authRequired, (req, res) => {
  const reunion = db.prepare('SELECT * FROM reunion WHERE id = ?').get(req.params.id);
  if (!reunion) return res.status(404).json({ error: 'réunion inconnue' });
  const participants = db.prepare(
    'SELECT * FROM reunion_participant WHERE reunion_id = ? ORDER BY nom').all(reunion.id);
  const taches = db.prepare(SELECT_TACHE + ' WHERE t.reunion_id = ? ORDER BY t.id')
    .all(reunion.id);
  // CE QUI RESTE OUVERT DES SÉANCES PRÉCÉDENTES, c'est le premier point de
  // toute réunion de suivi — et c'est justement ce qu'on oublie de préparer.
  const reste = db.prepare(SELECT_TACHE + `
    WHERE t.annee_scolaire = ? AND t.statut IN ('a_faire','en_cours')
      AND (t.reunion_id IS NULL OR t.reunion_id <> ?)
    ORDER BY CASE WHEN t.echeance IS NULL THEN 1 ELSE 0 END, t.echeance, t.id
  `).all(reunion.annee_scolaire, reunion.id);
  res.json({ ...reunion, participants, taches, reste });
});

r.post('/', authRequired, (req, res) => {
  const b = req.body || {};
  const info = db.prepare(`
    INSERT INTO reunion (annee_scolaire, titre, genre, date_seance, heure_seance,
                         lieu, ordre_du_jour, notes, statut, cree_par)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(anneeDeTravail(req), (b.titre || 'Réunion').trim(),
    b.genre || 'secretariat',
    b.date_seance || new Date().toISOString().slice(0, 10),
    b.heure_seance || null, b.lieu || null,
    b.ordre_du_jour || null, b.notes || null, b.statut || 'preparee', qui(req));

  for (const p of (b.participants || [])) {
    db.prepare(`INSERT INTO reunion_participant (reunion_id, user_id, nom, present, excuse)
                VALUES (?,?,?,?,?)`)
      .run(info.lastInsertRowid, p.user_id || null, p.nom, p.present ? 1 : 0, p.excuse ? 1 : 0);
  }
  res.json({ id: info.lastInsertRowid });
});

r.put('/:id', authRequired, (req, res) => {
  const reunion = db.prepare('SELECT * FROM reunion WHERE id = ?').get(req.params.id);
  if (!reunion) return res.status(404).json({ error: 'réunion inconnue' });
  const b = req.body || {};
  const v = (k) => (b[k] === undefined ? reunion[k] : b[k]);
  db.prepare(`
    UPDATE reunion SET titre=?, genre=?, date_seance=?, heure_seance=?, lieu=?,
      ordre_du_jour=?, notes=?, statut=? WHERE id=?
  `).run(v('titre'), v('genre'), v('date_seance'), v('heure_seance'), v('lieu'),
    v('ordre_du_jour'), v('notes'), v('statut'), req.params.id);

  if (Array.isArray(b.participants)) {
    db.prepare('DELETE FROM reunion_participant WHERE reunion_id = ?').run(req.params.id);
    for (const p of b.participants) {
      db.prepare(`INSERT INTO reunion_participant
                  (reunion_id, user_id, professeur_id, nom, present, excuse)
                  VALUES (?,?,?,?,?,?)`)
        .run(req.params.id, p.user_id || null, p.professeur_id || null,
          p.nom, p.present ? 1 : 0, p.excuse ? 1 : 0);
    }
  }
  res.json({ ok: true });
});

r.delete('/:id', authRequired,
  roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
    db.prepare('DELETE FROM reunion WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

// ─── LE PROCÈS-VERBAL ───────────────────────────────────────────────────────
//
// Une réunion qui ne produit pas de feuille ne se transmet pas : l'absent n'en
// saura rien, et personne ne pourra la relire. Le PV passe par l'enveloppe
// commune — A4, en-tête de l'établissement, pied numéroté.

r.post('/:id/document', authRequired, (req, res) => {
  const reunion = db.prepare('SELECT * FROM reunion WHERE id = ?').get(req.params.id);
  if (!reunion) return res.status(404).json({ error: 'réunion inconnue' });
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

  const participants = db.prepare(
    'SELECT * FROM reunion_participant WHERE reunion_id = ? ORDER BY nom').all(reunion.id);
  const taches = db.prepare(SELECT_TACHE + ' WHERE t.reunion_id = ? ORDER BY t.id')
    .all(reunion.id);

  const presents = participants.filter(p => p.present).map(p => esc(p.nom));
  const excuses = participants.filter(p => !p.present && p.excuse).map(p => esc(p.nom));
  const absents = participants.filter(p => !p.present && !p.excuse).map(p => esc(p.nom));

  const points = String(reunion.ordre_du_jour || '').split('\n')
    .map(l => l.trim()).filter(Boolean);

  const ligneTache = t => `<tr>
    <td>${esc(t.titre)}${t.detail ? `<br><span class="fin">${esc(t.detail)}</span>` : ''}</td>
    <td>${esc(t.responsable_nom || t.responsable_role || '—')}${t.obligation_libelle
      ? `<br><span class="fin">pour : ${esc(t.obligation_libelle)}${
          t.obligation_base ? ` — ${esc(t.obligation_base)}` : ''}</span>` : ''}</td>
    <td>${fr(t.echeance)}</td>
    <td>${esc(LIB_STATUT[t.statut] || t.statut)}</td>
  </tr>`;

  const corps = `
    <h1>${esc(reunion.titre)}</h1>
    <p class="sous">${fr(reunion.date_seance)}${reunion.heure_seance
      ? ` à ${esc(reunion.heure_seance)}` : ''}${reunion.lieu ? ` · ${esc(reunion.lieu)}` : ''}</p>

    <h3>Présences</h3>
    <p>${presents.length ? `<b>Présents :</b> ${presents.join(', ')}` : 'Aucun présent noté.'}
      ${excuses.length ? `<br><b>Excusés :</b> ${excuses.join(', ')}` : ''}
      ${absents.length ? `<br><b>Absents :</b> ${absents.join(', ')}` : ''}</p>

    ${points.length ? `<h3>Ordre du jour</h3><ol>${
      points.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}

    ${reunion.notes ? `<h3>Notes de séance</h3>${
      String(reunion.notes).split('\n').filter(l => l.trim())
        .map(l => `<p>${esc(l)}</p>`).join('')}` : ''}

    <h3>Ce qui a été décidé — et par qui</h3>
    ${taches.length ? `<table>
      <thead><tr><th>Tâche</th><th>Responsable</th><th>Pour le</th><th>État</th></tr></thead>
      <tbody>${taches.map(ligneTache).join('')}</tbody></table>`
      : '<p class="fin">Aucune tâche n\'a été confiée au cours de cette séance.</p>'}`;

  res.json({
    html: envelopperDocument({
      html: corps,
      titre: `${reunion.titre} — ${fr(reunion.date_seance)}`,
      styles: STYLE_PV,
    }),
    nom: `Reunion_${String(reunion.date_seance).replace(/\W/g, '')}.html`,
    titre: reunion.titre,
  });
});

/** La liste des tâches ouvertes, par responsable — la feuille de la réunion. */
r.post('/taches/document', authRequired, (req, res) => {
  const annee = anneeDeTravail(req);
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const taches = db.prepare(SELECT_TACHE + `
    WHERE t.annee_scolaire = ? ${req.body?.toutes ? '' : "AND t.statut IN ('a_faire','en_cours')"}
    ORDER BY COALESCE(u.nom_complet, t.responsable_role, 'zzz'),
             CASE WHEN t.echeance IS NULL THEN 1 ELSE 0 END, t.echeance
  `).all(annee);

  // PAR PERSONNE, PAS PAR DATE. On ne lit pas cette feuille pour savoir ce qui
  // tombe mardi : on la lit pour dire à chacun ce qu'il doit, et un nom qui
  // revient dix fois dans une liste chronologique ne se voit jamais d'un coup.
  const groupes = new Map();
  for (const t of taches) {
    const cle = t.responsable_nom || t.responsable_role || 'Sans responsable';
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(t);
  }

  const corps = `
    <h1>Tâches en cours</h1>
    <p class="sous">${esc(annee)} · ${taches.length} tâche(s) ouverte(s)
      · état au ${new Date().toLocaleDateString('fr-BE')}</p>
    ${[...groupes.entries()].map(([nom, liste]) => `
      <h3>${esc(nom)} <span class="fin">— ${liste.length} tâche(s)</span></h3>
      <table>
        <thead><tr><th>Tâche</th><th>Pour le</th><th>État</th><th>Décidée le</th></tr></thead>
        <tbody>${liste.map(t => `<tr>
          <td>${esc(t.titre)}${t.detail ? `<br><span class="fin">${esc(t.detail)}</span>` : ''}</td>
          <td>${fr(t.echeance)}</td>
          <td>${esc(LIB_STATUT[t.statut] || t.statut)}</td>
          <td>${t.reunion_date ? fr(t.reunion_date) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`).join('')}
    ${taches.length ? '' : '<p class="fin">Aucune tâche ouverte.</p>'}`;

  res.json({
    html: envelopperDocument({ html: corps, titre: 'Tâches en cours', styles: STYLE_PV }),
    nom: `Taches_${String(annee).replace(/\W/g, '')}.html`,
    titre: 'Tâches en cours',
  });
});

const LIB_STATUT = {
  a_faire: 'à faire', en_cours: 'en cours', fait: 'fait', abandonnee: 'abandonnée',
};

// Le même papier que les rapports : un filet sous l'en-tête, un filet fin entre
// les lignes, et rien d'autre — on lit des noms et des dates, pas une grille.
const STYLE_PV = `
  h1 { font-size: 14pt; letter-spacing: -.2pt; }
  .sous { color:#64748b; font-size:9pt; margin:0 0 6mm; }
  .fin  { color:#94a3b8; font-size:8pt; }
  h3 { font-size: 10pt; margin: 6mm 0 1mm; letter-spacing: -.1pt; }
  ol, ul { margin: 1mm 0 2mm 5mm; padding: 0; }
  li { margin: .8mm 0; font-size: 9pt; }
  table { margin: 0 0 2mm; }
  th, td { border: 0; padding: 1.6mm 2mm; font-size: 8.5pt;
           border-bottom: 0.3pt solid #e2e8f0; }
  th { background: transparent; color:#64748b; font-size: 7.5pt;
       border-bottom: 0.8pt solid #cbd5e1; }
  tbody tr:last-child td { border-bottom: 0; }`;

export default r;
