// ─────────────────────────────────────────────────────────────────────────────
// LES INSCRITS PRÉVUS, QUAND IL N'Y A PAS D'INSCRIT (Charles, 7 octobre 2026 :
// « opticien : s'il n'y a pas d'inscrit, il faut pouvoir les mettre à la main,
// idem ailleurs »). Une section qui ouvre sans inscription encodée — ou une
// unité — n'a ni recettes ni coût par étudiant dans la pièce du coût des
// formations. Le chiffre saisi ici ne remplace JAMAIS un inscrit réel : il ne
// sert que là où l'on n'en compte aucun, et la pièce le dit « prévu ».
// ue_num = 0 : la section entière.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired } from '../middleware/auth.js';

export function migrerEffectifsPrevus() {
  db.exec(`CREATE TABLE IF NOT EXISTS effectif_prevu (
    annee_scolaire TEXT NOT NULL, section TEXT NOT NULL, ue_num INTEGER NOT NULL DEFAULT 0,
    inscrits INTEGER NOT NULL, maj_le TEXT DEFAULT (datetime('now')), maj_par TEXT,
    PRIMARY KEY (annee_scolaire, section, ue_num))`);
}

/** Map `${section}|${ue_num}` → inscrits prévus, pour une année. */
export function effectifsPrevus(annee) {
  try {
    return new Map(db.prepare('SELECT section, ue_num, inscrits FROM effectif_prevu WHERE annee_scolaire = ?')
      .all(annee).map(x => [`${x.section}|${x.ue_num}`, x.inscrits]));
  } catch { return new Map(); }
}

const r = Router();

r.get('/', authRequired, (req, res) => {
  const { annee, section } = req.query;
  if (!annee || !section) return res.status(400).json({ error: 'annee et section requises' });
  const prevus = effectifsPrevus(annee);
  const ues = db.prepare(`SELECT ue_num, MIN(ue_nom) AS ue_nom FROM ue WHERE annee_scolaire = ? AND (section = ? OR ue_num IN
      (SELECT ue_num FROM ue_section WHERE section_code = ? AND annee_scolaire = ?)) GROUP BY ue_num ORDER BY ue_num`)
    .all(annee, section, section, annee);
  /* LES INSCRITS RÉELS SE COMPTENT COMME DANS LE RAPPORT (Charles, 8 octobre 2026 :
     « d'où vient le 121 ? » — 94 étudiants archivés portaient encore une inscription
     de l'année). Hors archivés ; la section de l'étudiant est son rattachement, sinon
     celle de l'unité, comme dans les chiffres clés. */
  const reel = db.prepare(`SELECT COUNT(DISTINCT i.etudiant_id) n FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND i.ue_num = ? AND COALESCE(e.sortie_statut, '') <> 'archive'`);
  const reelSection = db.prepare(`SELECT COUNT(DISTINCT i.etudiant_id) n FROM etudiant_inscription i JOIN etudiant e ON e.id = i.etudiant_id
      WHERE i.annee_scolaire = ? AND COALESCE(e.sortie_statut, '') <> 'archive'
        AND COALESCE(e.section_rattachement, (SELECT u.section FROM ue u WHERE u.ue_num = i.ue_num
          AND u.annee_scolaire = i.annee_scolaire AND COALESCE(u.hors_cursus, 0) = 0 LIMIT 1)) = ?`).get(annee, section).n;
  res.json({
    annee, section, section_reel: reelSection, section_prevu: prevus.get(`${section}|0`) ?? null,
    ues: ues.map(u => ({ ...u, reel: reel.get(annee, u.ue_num).n, prevu: prevus.get(`${section}|${u.ue_num}`) ?? null })),
  });
});

r.put('/', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'), (req, res) => {
  const { annee, section, valeurs } = req.body || {};
  if (!annee || !section || !Array.isArray(valeurs)) return res.status(400).json({ error: 'annee, section et valeurs requises' });
  const par = req.user?.nom || req.user?.email || null;
  const pose = db.prepare(`INSERT INTO effectif_prevu (annee_scolaire, section, ue_num, inscrits, maj_par) VALUES (?,?,?,?,?)
    ON CONFLICT(annee_scolaire, section, ue_num) DO UPDATE SET inscrits = excluded.inscrits, maj_par = excluded.maj_par, maj_le = datetime('now')`);
  const ote = db.prepare('DELETE FROM effectif_prevu WHERE annee_scolaire = ? AND section = ? AND ue_num = ?');
  db.transaction(() => {
    for (const v of valeurs) {
      const ue = Number(v?.ue_num) || 0;
      const n = v?.inscrits === '' || v?.inscrits == null ? null : Math.max(0, Math.round(Number(v.inscrits)));
      if (n == null || Number.isNaN(n)) ote.run(annee, section, ue); else pose.run(annee, section, ue, n, par);
    }
  })();
  res.json({ ok: true });
});

export default r;
