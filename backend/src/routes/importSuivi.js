// ─────────────────────────────────────────────────────────────────────────────
// Lucie — L'IMPORT DU CLASSEUR DE SUIVI
//
// Jusqu'ici, faire entrer une année de résultats dans Lucie voulait dire ouvrir
// le classeur, sélectionner un rectangle, coller, recommencer pour l'unité
// suivante — seize fois, en se trompant une fois sur dix. Le classeur contient
// pourtant tout : les pondérations, les notes des deux sessions, la décision
// du jury, les cours à représenter. Il suffisait de le lire.
//
// La lecture du classeur se fait côté navigateur (lib/suiviClasseur.js) : c'est
// là qu'est la géométrie, et le fichier fait quinze mégaoctets qu'il serait
// absurde de téléverser. Ce module reçoit ce qui en a été extrait, rapproche
// les étudiants, et écrit.
//
// DEUX TEMPS, TOUJOURS. Une simulation dit ce qui va se passer ; l'application
// le fait. Un import de cette portée — plusieurs milliers de notes et de
// décisions — ne se lance pas sans avoir vu d'abord qui ne sera pas reconnu.
//
// ON NE REDÉLIBÈRE PAS. La décision lue en II ou en WW est celle du Conseil :
// elle s'écrit telle quelle. Lucie recalcule les notes, jamais la décision.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from 'express';
import db from '../db/index.js';
import { authRequired, roleRequired, getUserSections } from '../middleware/auth.js';
import { anneeDeTravail } from '../helpers/annee.js';

const r = Router();

const clean = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * RETROUVER L'ÉTUDIANT.
 *
 * Le matricule d'abord — c'est lui qui fait foi. À défaut, le nom et le prénom,
 * mais seulement parmi les INSCRITS À CETTE UNITÉ et seulement si un seul
 * répond : deux homonymes valent mieux non rapprochés que mal rapprochés.
 */
function chercheur(annee, ueNum) {
  const parMatricule = db.prepare(
    'SELECT etudiant_id AS id FROM etudiant_matricule WHERE id_ecampus = ?');
  const parIdEcampus = db.prepare('SELECT id FROM etudiant WHERE id_ecampus = ? LIMIT 1');
  const inscrits = db.prepare(`
    SELECT e.id, e.nom, e.prenom FROM etudiant_inscription i
    JOIN etudiant e ON e.id = i.etudiant_id
    WHERE i.annee_scolaire = ? AND i.ue_num = ?
  `).all(annee, ueNum);
  const idsInscrits = new Set(inscrits.map(x => x.id));

  return (l) => {
    const mat = String(l.matricule || '').trim();
    if (mat) {
      const a = parMatricule.get(mat) || parIdEcampus.get(mat);
      if (a) return { id: a.id, methode: 'matricule', inscrit: idsInscrits.has(a.id) };
    }
    const nom = clean(l.nom), prenom = clean(l.prenom);
    if (nom) {
      const c = inscrits.filter(x => clean(x.nom) === nom
        && (!prenom || clean(x.prenom).startsWith(prenom.slice(0, 5))));
      if (c.length === 1) return { id: c[0].id, methode: 'identité', inscrit: true };
      if (c.length > 1) return { ambigu: true };
    }
    return null;
  };
}

/**
 * L'IMPORT.
 *
 * `unites` vient de lireClasseur() : par unité, ses pondérations, ses cours et
 * ses étudiants avec leurs notes des deux sessions.
 */
r.post('/', authRequired, roleRequired('admin', 'directeur', 'directeur_adjoint'),
       (req, res) => {
  const {
    unites, annee, simulation = true,
    ponderations: importerPonderations = true,
    notes: importerNotes = true,
    decisions: importerDecisions = true,
  } = req.body || {};

  const an = annee || anneeDeTravail(req);
  if (!Array.isArray(unites) || !unites.length) {
    return res.status(400).json({ error: 'aucune unité à importer' });
  }

  const perim = getUserSections(req.user);
  const par = req.user?.email || null;
  const rapport = { simulation, annee: an, unites: [], total: {
    unites: 0, etudiants: 0, rapproches: 0, inconnus: 0, hors_inscription: 0,
    collisions: 0, notes_s1: 0, notes_s2: 0, decisions: 0, ajournements: 0,
    ponderations: 0, acquis: 0, acquis_retires: 0,
  } };

  // ── Les écritures ────────────────────────────────────────────────────────
  const posePoidsCours = db.prepare(`
    INSERT INTO cours_ponderation (ue_num, cours_code, poids) VALUES (?,?,?)
    ON CONFLICT(ue_num, cours_code) DO UPDATE SET poids = excluded.poids`);
  const posePoidsAA = db.prepare(`
    INSERT INTO aa_ponderation (ue_num, cours_code, aa_code, poids) VALUES (?,?,?,?)
    ON CONFLICT(cours_code, aa_code) DO UPDATE SET poids = excluded.poids,
      ue_num = excluded.ue_num`);
  // L'ACQUIS EXISTE AVANT D'ÊTRE PONDÉRÉ.
  //
  // Le référentiel du classeur porte son numéro et son énoncé — le texte même
  // de ce que l'étudiant doit savoir faire. Sans lui, Lucie n'a que des codes
  // nus, et une notification d'ajournement ne peut pas nommer l'acquis non
  // maîtrisé comme le règlement l'exige. On complète donc sans écraser : un
  // énoncé déjà présent, venu du dossier pédagogique, reste le bon.
  const poserAA = db.prepare(`
    INSERT INTO aa (aa_code, aa_num, ue_num, description) VALUES (?,?,?,?)
    ON CONFLICT(aa_code) DO UPDATE SET
      ue_num      = excluded.ue_num,
      aa_num      = COALESCE(excluded.aa_num, aa.aa_num),
      description = COALESCE(NULLIF(aa.description, ''), excluded.description)`);
  const creerAA = db.prepare(`
    INSERT INTO aa (aa_code, ue_num, cours_code) VALUES (?,?,?)
    ON CONFLICT(aa_code) DO UPDATE SET ue_num = excluded.ue_num`);
  const poseNote = db.prepare(`
    INSERT INTO etudiant_note_detail
      (etudiant_id, annee_scolaire, ue_num, type, code, cours_code, points)
    VALUES (?,?,?, 'aa', ?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, type, code) DO UPDATE SET
      points = excluded.points, cours_code = excluded.cours_code, mention = NULL`);
  const poseAjustement = db.prepare(`
    INSERT INTO deliberation_ajustement
      (etudiant_id, annee_scolaire, ue_num, session, portee, code, action, maj_par)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, session, portee, code)
    DO UPDATE SET action = excluded.action, maj_le = CURRENT_TIMESTAMP,
                  maj_par = excluded.maj_par`);
  const poseResultat = db.prepare(`
    INSERT INTO deliberation_resultat
      (etudiant_id, annee_scolaire, ue_num, session, resultat, decide_par)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(etudiant_id, annee_scolaire, ue_num, session) DO UPDATE SET
      resultat = excluded.resultat, decide_le = CURRENT_TIMESTAMP,
      decide_par = excluded.decide_par`);
  const finalDe = db.prepare(`
    SELECT resultat FROM deliberation_resultat
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?
      AND resultat IS NOT NULL AND resultat != ''
    ORDER BY session DESC LIMIT 1`);
  const majInscription = db.prepare(`
    UPDATE etudiant_inscription SET resultat = ?
    WHERE etudiant_id = ? AND annee_scolaire = ? AND ue_num = ?`);

  const executer = () => {
    for (const u of unites) {
      const ueNum = Number(u.ue_num);
      const fiche = { ue_num: ueNum, etudiants: 0, rapproches: 0, inconnus: [],
        hors_inscription: [], collisions: [], notes_s1: 0, notes_s2: 0,
        decisions: 0, ajournements: 0, ponderations: 0, acquis: 0,
        acquis_hors_referentiel: [], acquis_retires: [], acquis_a_verifier: [],
        ignoree: null };

      const ue = db.prepare(
        'SELECT ue_num, section FROM ue WHERE ue_num = ? AND annee_scolaire = ?')
        .get(ueNum, an);
      if (!ue) { fiche.ignoree = `inconnue en ${an}`; rapport.unites.push(fiche); continue; }
      if (perim && ue.section && !perim.includes(ue.section)) {
        fiche.ignoree = 'hors de votre périmètre'; rapport.unites.push(fiche); continue;
      }
      rapport.total.unites++;

      // ── Les pondérations ────────────────────────────────────────────────
      //
      // Elles viennent avant les notes : sans elles, une note d'acquis ne se
      // rattache à aucun cours et l'unité reste incalculable. C'est ce que le
      // classeur apporte de plus précieux — la structure, pas seulement les
      // chiffres.
      if (importerPonderations) {
        // Les acquis déclarés au référentiel, d'abord : la pondération qui
        // suit se pose sur des acquis qui existent et qui s'énoncent.
        for (const a of (u.acquis || [])) {
          if (!simulation) poserAA.run(a.aa_code, a.aa_num, ueNum, a.description);
          fiche.acquis++;
        }
        // Ce que la grille pondère sans que le référentiel le connaisse : on
        // le dit, car c'est presque toujours un acquis oublié dans l'onglet AA.
        fiche.acquis_hors_referentiel = u.acquis_hors_referentiel || [];

        // ── LE MÉNAGE ───────────────────────────────────────────────────────
        //
        // « Si l'acquis n'a pas de poids, il n'existe pas. » Les quinze lignes
        // du gabarit ont laissé dans la base des acquis que rien n'évalue :
        // ils remplissaient la feuille de délibération de rangées vides, et
        // l'on ne pouvait plus lire d'un coup d'œil si tous les acquis étaient
        // au seuil — la question même que le Conseil se pose.
        //
        // On ne supprime que ce qui ne tient à rien : absent du référentiel du
        // classeur, sans pondération dans aucun cours, et sans la moindre note
        // encodée. Un acquis auquel pend une note reste en place et se
        // signale : c'est alors une correction à faire à la main, pas un
        // reliquat.
        if (u.acquis?.length) {
          const declares = new Set(u.acquis.map(a => a.aa_code));
          const enTrop = db.prepare('SELECT aa_code FROM aa WHERE ue_num = ?')
            .all(ueNum).map(a => a.aa_code).filter(c => !declares.has(c));

          for (const code of enTrop) {
            const pondere = db.prepare(
              'SELECT 1 FROM aa_ponderation WHERE ue_num = ? AND aa_code = ? AND poids > 0 LIMIT 1')
              .get(ueNum, code);
            if (pondere) continue;
            const note = db.prepare(`
              SELECT 1 FROM etudiant_note_detail
              WHERE ue_num = ? AND type = 'aa' AND (code = ? OR code LIKE ?) LIMIT 1
            `).get(ueNum, code, `%|${code}`);
            if (note) { fiche.acquis_a_verifier.push(code); continue; }

            if (!simulation) {
              db.prepare('DELETE FROM aa_ponderation WHERE ue_num = ? AND aa_code = ?')
                .run(ueNum, code);
              db.prepare('DELETE FROM aa WHERE aa_code = ? AND ue_num = ?').run(code, ueNum);
            }
            fiche.acquis_retires.push(code);
          }
          rapport.total.acquis_retires += fiche.acquis_retires.length;
        }

        for (const c of (u.cours || [])) {
          if (!simulation) posePoidsCours.run(ueNum, c.cours_code, c.poids_cours / 10);
          fiche.ponderations++;
        }
        for (const p of (u.ponderations || [])) {
          if (!simulation) {
            creerAA.run(p.aa_code, ueNum, p.cours_code);
            posePoidsAA.run(ueNum, p.cours_code, p.aa_code, p.poids_aa);
          }
          fiche.ponderations++;
        }
        rapport.total.ponderations += fiche.ponderations;
        rapport.total.acquis += fiche.acquis;
      }

      const trouver = chercheur(an, ueNum);

      // DEUX LIGNES NE PEUVENT PAS DÉSIGNER LE MÊME DOSSIER.
      //
      // Un matricule recopié d'une ligne à l'autre — cela arrive, un classeur
      // se remplit à la main — ferait écrire les notes du second sur le
      // premier, en silence, et l'ON CONFLICT achèverait le travail. On
      // rapproche donc tout le monde d'abord, et l'on écarte les deux lignes
      // en cause : mieux vaut deux étudiants à saisir à la main que deux
      // dossiers faux.
      const vus = new Map();
      const collision = new Set();
      for (const e of (u.etudiants || [])) {
        const t = trouver(e);
        if (!t || t.ambigu) continue;
        if (vus.has(t.id)) {
          collision.add(t.id);
          if (fiche.collisions.length < 20) {
            fiche.collisions.push(
              `${vus.get(t.id)} et ${e.nom} ${e.prenom} désignent le même dossier`);
          }
        } else vus.set(t.id, `${e.nom} ${e.prenom}`);
      }
      rapport.total.collisions += collision.size;

      for (const e of (u.etudiants || [])) {
        fiche.etudiants++;
        const t = trouver(e);
        const nomComplet = `${e.matricule || ''} ${e.nom} ${e.prenom}`.trim();
        if (!t || t.ambigu) {
          if (fiche.inconnus.length < 30) fiche.inconnus.push(nomComplet + (t?.ambigu ? ' (homonymes)' : ''));
          rapport.total.inconnus++;
          continue;
        }
        if (collision.has(t.id)) continue;   // signalé plus haut, jamais écrit
        if (!t.inscrit) {
          // Reconnu, mais pas inscrit à cette unité cette année : une note
          // écrite là serait invisible partout. On le dit plutôt que de la
          // perdre en silence.
          if (fiche.hors_inscription.length < 30) fiche.hors_inscription.push(nomComplet);
          rapport.total.hors_inscription++;
          continue;
        }
        fiche.rapproches++;
        rapport.total.rapproches++;

        // ── Les notes de première session ─────────────────────────────────
        if (importerNotes) {
          for (const n of (e.s1?.notes || [])) {
            if (!simulation) {
              poseNote.run(t.id, an, ueNum, `s1|${n.cours_code}|${n.aa_code}`,
                n.cours_code, n.valeur);
            }
            fiche.notes_s1++; rapport.total.notes_s1++;
          }
        }

        // ── La décision de première session, et ce qui reste à représenter ──
        if (importerDecisions && e.s1?.decision) {
          if (!simulation) poseResultat.run(t.id, an, ueNum, 1, e.s1.decision, par);
          fiche.decisions++; rapport.total.decisions++;

          for (const cours of (e.s1.a_representer || [])) {
            if (!simulation) {
              poseAjustement.run(t.id, an, ueNum, 1, 'cours', cours, 'ajourne', par);
            }
            fiche.ajournements++; rapport.total.ajournements++;
          }
        }

        // ── La seconde session — et seulement pour qui la présente ─────────
        //
        // Aller lire la seconde session d'un étudiant qui a réussi en juin,
        // c'est importer les cases d'un classeur qui recopie ses colonnes :
        // on écrirait une note de septembre à quelqu'un qui n'y était pas.
        const aPresente = e.s1?.decision && e.s1.decision !== 'reussi';
        if (aPresente) {
          if (importerNotes) {
            for (const n of (e.s2?.notes || [])) {
              if (!simulation) {
                poseNote.run(t.id, an, ueNum, `s2|${n.cours_code}|${n.aa_code}`,
                  n.cours_code, n.valeur);
              }
              fiche.notes_s2++; rapport.total.notes_s2++;
            }
          }
          if (importerDecisions && e.s2?.decision) {
            if (!simulation) poseResultat.run(t.id, an, ueNum, 2, e.s2.decision, par);
            fiche.decisions++; rapport.total.decisions++;
            // La faveur du classeur devient celle du Conseil : elle porte sur
            // l'unité et la met au seuil, comme dans la feuille.
            if (e.s2.faveur && !simulation) {
              poseAjustement.run(t.id, an, ueNum, 2, 'ue', '*', 'faveur', par);
            }
          }
        }

        // Le dossier porte la décision de la session la plus avancée.
        if (importerDecisions && !simulation) {
          const fin = finalDe.get(t.id, an, ueNum) || {};
          majInscription.run(fin.resultat ?? null, t.id, an, ueNum);
        }
        rapport.total.etudiants++;
      }

      rapport.unites.push(fiche);
    }
  };

  if (simulation) executer();
  else db.transaction(executer)();

  res.json(rapport);
});

export default r;
