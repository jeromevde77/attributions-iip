#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// diag-pae.js — Pourquoi CE programme, pour CET étudiant ?
//
// « Il a réussi tout son BA1, pourtant tu ne lui donnes pas un PAE avec les UE
// auxquelles il a droit » (Jérôme, 24 septembre 2026). La réponse est dans la
// base, mais éparpillée : résultats par année, décisions de délibération,
// section déduite, UE organisées, prérequis. Ce script les met côte à côte,
// et appelle LES MÊMES fonctions que l'écran (composerPAE, admissibilitePAE) :
// un diagnostic qui recalculerait à sa façon pourrait dire autre chose que
// Lucie.
//
// LECTURE SEULE : rien n'est inscrit, rien n'est modifié.
//
//   docker exec attributions-backend node scripts/diag-pae.js AKABI 2026-2027
//   docker exec attributions-backend node scripts/diag-pae.js 1234 2026-2027
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import db from '../src/db/index.js';
import { composerPAE, admissibilitePAE, sectionRattachement } from '../src/routes/etudiants.js';

const qui = (process.argv[2] || '').trim();
const annee = (process.argv[3] || '').trim();
if (!qui || !/^\d{4}-\d{4}$/.test(annee)) {
  console.log('Usage : node scripts/diag-pae.js <nom ou id> <année du PAE, ex. 2026-2027>');
  process.exit(1);
}
const [a1] = annee.split('-').map(Number);
const anneePrec = `${a1 - 1}-${a1}`;

const etudiants = /^\d+$/.test(qui)
  ? db.prepare('SELECT * FROM etudiant WHERE id = ?').all(Number(qui))
  : db.prepare(`SELECT * FROM etudiant WHERE UPPER(nom) LIKE UPPER(?) OR UPPER(prenom || ' ' || nom) LIKE UPPER(?)
                ORDER BY nom, prenom`).all(`%${qui}%`, `%${qui}%`);
if (!etudiants.length) { console.log(`Aucun étudiant ne correspond à « ${qui} ».`); process.exit(0); }

for (const e of etudiants) {
  console.log('\n' + '═'.repeat(78));
  console.log(`#${e.id} ${e.nom} ${e.prenom} · actif=${e.actif} · rattachement=${e.section_rattachement || '(déduit)'}`
    + `${e.sortie_statut ? ` · sorti : ${e.sortie_statut}` : ''}`);
  const rat = sectionRattachement(e.id, anneePrec);
  console.log(`Section retenue pour ${anneePrec} : ${rat.section || 'AUCUNE'}${rat.deduite ? ' (déduite)' : ''}`);

  console.log('\n— Inscriptions et résultats, toutes années —');
  const ins = db.prepare(`
    SELECT i.annee_scolaire, i.ue_num, i.resultat,
      (SELECT section FROM ue u WHERE u.ue_num = i.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS section,
      (SELECT ue_niv FROM ue u WHERE u.ue_num = i.ue_num ORDER BY u.annee_scolaire DESC LIMIT 1) AS niv,
      (SELECT GROUP_CONCAT('S' || session || '=' || resultat, ' ') FROM deliberation_resultat d
        WHERE d.etudiant_id = i.etudiant_id AND d.ue_num = i.ue_num
          AND d.annee_scolaire = i.annee_scolaire) AS delib
    FROM etudiant_inscription i WHERE i.etudiant_id = ?
    ORDER BY i.annee_scolaire, i.ue_num`).all(e.id);
  if (!ins.length) console.log('  (aucune inscription)');
  for (const l of ins) {
    console.log(`  ${l.annee_scolaire}  UE ${String(l.ue_num).padEnd(5)} ${String(l.section || '?').padEnd(6)}`
      + ` ${String(l.niv || '?').padEnd(4)} résultat=${l.resultat ?? '—'}${l.delib ? `  délib: ${l.delib}` : ''}`);
  }

  const adm = admissibilitePAE(e.id, anneePrec);
  console.log(`\n— Admissible à la promotion depuis ${anneePrec} : ${adm.admissible ? 'OUI' : 'NON'}`);
  for (const x of adm.attentes) console.log(`  bloque : UE ${x.ue_num} ${x.ue_nom || ''} — ${x.raison}`);

  const c = composerPAE(e.id, annee, rat.section ? { section: rat.section } : {});
  if (c.erreur) { console.log(`\nComposition impossible : ${c.erreur}`); continue; }
  console.log(`\n— PAE ${annee} · sections ${c.sections.join(', ') || 'AUCUNE'} · ${c.pae.length} UE organisées —`);
  if (!c.pae.length) console.log('  Aucune UE organisée (organisation_ue) pour cette section et cette année.');
  for (const u of c.pae) {
    const etat = u.deja_reussie ? 'réussie'
      : u.propose ? (u.propose_sous_reserve ? 'PROPOSÉE sous réserve' : 'PROPOSÉE')
      : u.epreuve_integree ? `épreuve fermée (reste ${(u.epreuve_restantes || []).join(', ')})`
      : `bloquée — prérequis manquants : ${(u.prereq_chaine || u.prereq_manquants || []).join(', ')}`;
    console.log(`  UE ${String(u.ue_num).padEnd(5)} ${String(u.ue_niv || '?').padEnd(4)} ${u.inscrite ? '[inscrit] ' : ''}${etat}`
      + `  ${u.ue_nom || ''}`);
  }
}
console.log('');
process.exit(0);
