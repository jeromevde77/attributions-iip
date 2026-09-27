import { Router } from 'express';
import db from '../db/index.js';
import { anneeDeTravail } from '../helpers/annee.js';
import { authRequired, roleRequired } from '../middleware/auth.js';
import { genererContrat } from '../services/contrat_fill.js';
import { genererApercu } from '../services/contrat_preview.js';
import { genererContratPdf } from '../services/contrat_pdf.js';
import { genererContratExpert, niveauSection, TAUX_DEFAUT } from '../services/contrat_expert.js';

const r = Router();

/**
 * UN CONTRAT PAR STATUT — ET LES LIGNES D'EXPERT N'ONT RIEN À FAIRE SUR CELUI-CI.
 *
 * Le contrat chargeait TOUTES les attributions du professeur pour l'année. Or
 * l'engagement d'un expert n'est pas le même contrat de travail qu'une charge
 * CC : un membre du personnel qui porte les deux doit recevoir DEUX contrats,
 * et faire figurer ses périodes d'expert sur le contrat CC produit une pièce
 * signée qui engage l'école sur une base qui n'est pas la sienne.
 *
 * Le statut effectif d'une ligne, c'est celui de son exception si elle en porte
 * une, sinon celui du membre du personnel — la règle posée en 2.12.3, et c'est
 * précisément elle qui rend ce cas possible : CC ici, expert là.
 *
 * Lucie n'a qu'UN modèle, celui du contrat CC. On ne fabrique donc pas le
 * contrat d'expert avec le modèle du voisin : on écarte ses lignes, et on
 * RETOURNE ce qu'on a écarté pour que l'écran le dise. Une exclusion muette
 * ferait croire que la charge d'expert est couverte.
 */
function chargerDonneesContrat(prof_id, annee) {
  const anneeActive = annee || db.prepare("SELECT code FROM annee_scolaire WHERE active=1").get()?.code || '';
  const prof  = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id);
  if (!prof) return { prof: null };
  const etab  = db.prepare('SELECT * FROM etablissement LIMIT 1').get() || {};
  const toutes = db.prepare(`
    SELECT a.section, a.code_cours, a.ue_num,
           a.periodes_attribuees AS periodes_attribuees,
           a.autonomie_attribuee AS autonomie_attribuee,
           u.ue_nom AS ue_nom, c.cours_nom AS cours_nom,
           c.ct_pp AS ct_pp, a.type_cours AS type_cours,
           a.en_conge AS en_conge,
           (SELECT p2.nom || ' ' || p2.prenom FROM attribution a2
            JOIN professeur p2 ON p2.id = a2.professeur_id
            WHERE a2.code_cours = a.code_cours AND a2.section = a.section
            AND a2.annee_scolaire = a.annee_scolaire AND a2.en_conge = 1
            LIMIT 1) AS titulaire_en_conge,
           COALESCE(a.statut_exception, p.statut) AS statut_ligne
    FROM attribution a
    JOIN professeur p ON p.id = a.professeur_id
    LEFT JOIN ue u ON u.ue_num = a.ue_num AND u.annee_scolaire = a.annee_scolaire
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
    WHERE a.professeur_id = ? AND a.annee_scolaire = ?
    AND (a.type_cours IS NULL OR a.type_cours != 'Z')
    ORDER BY a.section, a.code_cours
  `).all(prof_id, anneeActive);

  const estExpert = l => String(l.statut_ligne || '').toUpperCase() === 'EXP';
  const attributions = toutes.filter(l => !estExpert(l));
  const ecartees = toutes.filter(estExpert);

  return { anneeActive, prof, etab, attributions, ecartees };
}

// ── GET /apercu — prévisualisation HTML ───────────────────────────────────────
r.post('/apercu', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  try {
    const { prof_id, date_contrat, annee, representant } = req.body;
    const { anneeActive, prof, etab, attributions, ecartees } = chargerDonneesContrat(prof_id, annee);
    if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });

    const html = genererApercu({ etab, prof, attributions, annee: anneeActive, date_contrat, representant,
      templateHtml: (() => { try { return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'contrat_template'").get()?.valeur || null; } catch { return null; } })(),
    });
    /* CE QUI A ÉTÉ ÉCARTÉ SE DIT. L'écran doit pouvoir annoncer qu'un second
       contrat — celui d'expert — reste à établir : une exclusion silencieuse
       ferait croire que ces périodes sont couvertes par la pièce qu'on signe. */
    res.json({ html, nom: `Contrat_${prof.nom}_${prof.prenom}_${date_contrat||''}`,
      ecartees_expert: ecartees.map(l => ({
        section: l.section, code_cours: l.code_cours, cours_nom: l.cours_nom,
        periodes: l.periodes_attribuees })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── LE CONTRAT D'UN EXPERT (27 septembre 2026) ─────────────────────────────
 * Les lignes que le contrat CC écarte sont précisément celles-ci : le même
 * chargement, l'autre moitié. Un contrat par niveau — supérieur, secondaire —,
 * parce que la période n'y est pas rétribuée au même taux. Il accompagne
 * toujours l'EA12 de l'expert. */
function lignesExpert(prof_id, annee) {
  const d = chargerDonneesContrat(prof_id, annee);
  if (!d.prof) return { ...d, parNiveau: {} };
  const niv = db.prepare('SELECT code, niveau FROM section').all();
  const nivDe = Object.fromEntries(niv.map(x => [x.code, niveauSection(x.niveau)]));
  const dates = ue => {
    try { return db.prepare(`SELECT MIN(date_debut) d, MAX(date_fin) f FROM organisation_ue
      WHERE annee_scolaire = ? AND ue_num = ?`).get(d.anneeActive, ue) || {}; } catch { return {}; }
  };
  const parNiveau = {};
  for (const l of d.ecartees) {
    const n = nivDe[l.section] || 'superieur';
    const o = dates(l.ue_num);
    (parNiveau[n] ||= []).push({ ue_num: l.ue_num, ue_nom: l.ue_nom, section: l.section,
      periodes: (l.periodes_attribuees || 0) + (l.autonomie_attribuee || 0), cla: l.ct_pp || l.type_cours,
      debut: o.d || null, fin: o.f || null });
  }
  return { ...d, parNiveau };
}
function tauxExpert(niveau) {
  try {
    const v = db.prepare('SELECT valeur FROM lucie_config WHERE cle = ?').get(`taux_expert_${niveau}`)?.valeur;
    if (v != null && v !== '' && !Number.isNaN(Number(String(v).replace(',', '.')))) return Number(String(v).replace(',', '.'));
  } catch { /* */ }
  return TAUX_DEFAUT[niveau];
}
r.get('/expert/:profId', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { prof, parNiveau } = lignesExpert(Number(req.params.profId), req.query.annee);
  if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });
  res.json({ niveaux: Object.entries(parNiveau).map(([niveau, l]) => ({
    niveau, periodes: l.reduce((n, x) => n + Math.round(Number(x.periodes) || 0), 0), unites: new Set(l.map(x => x.ue_num)).size,
    taux: tauxExpert(niveau) })) });
});
/* LE STATUT D'UN MEMBRE, POUR L'ANNÉE (27 septembre 2026) : chargé de cours,
   expert, ou les deux. C'est lui qui dit quelles pièces lui reviennent — un
   contrat et un EA12 classiques pour ses périodes CC, un contrat et un EA12
   d'expert pour les autres — et il se lit sur ses LIGNES d'attribution (le
   statut de la ligne, sinon celui du membre), non sur sa seule fiche. */
r.get('/statut/:profId', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { prof, attributions, parNiveau } = lignesExpert(Number(req.params.profId), req.query.annee);
  if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });
  const cc = attributions.reduce((n, l) => n + (l.periodes_attribuees || 0) + (l.autonomie_attribuee || 0), 0);
  const niveaux = Object.entries(parNiveau).map(([niveau, l]) => ({
    niveau, periodes: l.reduce((n, x) => n + Math.round(Number(x.periodes) || 0), 0),
    unites: new Set(l.map(x => x.ue_num)).size, taux: tauxExpert(niveau) }));
  const exp = niveaux.reduce((n, x) => n + x.periodes, 0);
  const statut = cc > 0 && exp > 0 ? 'mixte' : exp > 0 ? 'expert' : cc > 0 ? 'cc' : 'aucun';
  res.json({ statut, cc: { periodes: Math.round(cc) }, expert: { periodes: exp, niveaux } });
});

r.post('/expert/apercu', authRequired, roleRequired('admin', 'editeur'), (req, res) => {
  const { prof_id, date_contrat, annee, representant, niveau = 'superieur' } = req.body || {};
  const { anneeActive, prof, etab, parNiveau } = lignesExpert(Number(prof_id), annee);
  if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });
  const lignes = parNiveau[niveau] || [];
  if (!lignes.length) return res.status(400).json({ error: "Aucune prestation d'expert à ce niveau pour cette année." });
  const templateHtml = (() => { try { return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'contrat_expert_template'").get()?.valeur || null; } catch { return null; } })();
  const html = genererContratExpert({ etab, prof, lignes, annee: anneeActive, date_contrat: date_contrat || new Date().toISOString().slice(0, 10),
    representant, niveau, taux: tauxExpert(niveau), templateHtml });
  res.json({ html, nom: `Contrat_expert_${niveau}_${prof.nom}_${prof.prenom}_${anneeActive}` });
});

// ── POST /pdf — génère le PDF côté serveur (Chrome headless), pied de page fiable sur chaque page ──
r.post('/pdf', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  try {
    const { prof_id, date_contrat, annee, representant } = req.body;
    const { anneeActive, prof, etab, attributions } = chargerDonneesContrat(prof_id, annee);
    if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });

    const html = genererApercu({ etab, prof, attributions, annee: anneeActive, date_contrat, representant,
      templateHtml: (() => { try { return db.prepare("SELECT valeur FROM lucie_config WHERE cle = 'contrat_template'").get()?.valeur || null; } catch { return null; } })(),
    });
    const pdfBuffer = await genererContratPdf(html);
    console.log('[contrats/pdf] buffer généré :', Buffer.isBuffer(pdfBuffer), pdfBuffer.length, 'octets');

    const fn = `Contrat_${prof.nom}_${prof.prenom}_${date_contrat||''}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    console.error('[contrats/pdf]', err);
    // Sur un serveur sans Chromium, l'utilisateur recevait une 500 muette et
    // le contrat devenait inaccessible. On le dit, et on renvoie vers
    // l'aperçu, qui s'imprime depuis le navigateur sans rien installer.
    const { capacitePdf } = await import('../services/pdf.js');
    const cap = await capacitePdf();
    if (!cap.disponible) {
      return res.status(503).json({
        error: "Ce serveur ne sait pas produire de PDF. Utilisez l'aperçu, "
             + "puis l'impression du navigateur.",
        capacite_absente: 'pdf',
        detail: cap.raison,
      });
    }
    res.status(500).json({ error: err.message });
  }
});


r.post('/generer', authRequired, roleRequired('admin', 'editeur'), async (req, res) => {
  const { prof_id, date_contrat, annee, representant } = req.body;
  if (!prof_id) return res.status(400).json({ error: 'prof_id requis' });

  const prof = db.prepare('SELECT * FROM professeur WHERE id = ?').get(prof_id);
  if (!prof) return res.status(404).json({ error: 'Professeur introuvable' });

  const etab = db.prepare('SELECT * FROM etablissement WHERE id = 1').get() || {};
  const anneeActive = annee || anneeDeTravail(req) || '2026-2027';

  // Récupérer les attributions du prof pour l'année
  const attributions = db.prepare(`
    SELECT a.ue_num, a.code_cours, a.section, a.periodes_attribuees, a.autonomie_attribuee,
           u.ue_nom, c.cours_nom, c.ct_pp, a.type_cours
    FROM attribution a
    LEFT JOIN ue   u ON u.ue_num    = a.ue_num    AND u.annee_scolaire = a.annee_scolaire
    LEFT JOIN cours c ON c.cours_code = a.code_cours AND c.annee_scolaire = a.annee_scolaire
    WHERE a.professeur_id = ? AND a.annee_scolaire = ?
      AND (a.type_cours IS NULL OR a.type_cours != 'Z')
    ORDER BY a.section, a.ue_num, a.code_cours
  `).all(prof_id, anneeActive);

  try {
    const docx = await genererContrat({
      etab: { ...etab, etab_abrev: 'IIP' },
      prof,
      attributions,
      annee: anneeActive,
      date_contrat: date_contrat || new Date().toISOString().split('T')[0],
      representant,
    });

    const fn = `Contrat_${prof.nom}_${prof.prenom}_${date_contrat || 'draft'}.docx`
      .replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fn}"`);
    res.send(docx);
  } catch (err) {
    console.error('[contrats]', err);
    res.status(500).json({ error: err.message });
  }
});

export default r;
