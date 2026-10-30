/**
 * MON PARCOURS ET MES FRAIS, DANS L'ESPACE DE L'ÉTUDIANT (3.1.517, Charles, 30 octobre 2026 : « toutes les infos de son
 * ou ses inscriptions, le schéma de capitalisation… » ; maquettes du projet du portail, écrans 5 et 8).
 *
 * Rien n'est recalculé ailleurs : le parcours vient du moteur du PAE (`composerPAE` : l'état de chaque unité de ses
 * sections, l'année active), les frais de `calculerFrais` (la note de frais), le QR de paiement de `qrSvg` sur la charge
 * EPC du virement — les mêmes chiffres que la fiche et la note de frais. Lucie dépose, le portail affiche.
 */
import db from '../db/index.js';
import { composerPAE } from '../routes/etudiants.js';
import { calculerFrais } from '../routes/fraisScolarite.js';
import { qrSvg } from './banque.js';

/** Le parcours de l'année : chaque unité de ses sections, son état, ses crédits ; les crédits acquis. */
export function parcoursPortail(e, annee) {
  let c;
  try { c = composerPAE(e.id, annee); } catch { return null; }
  if (!c || c.erreur) return null;
  const ects = db.prepare('SELECT ects FROM ue WHERE ue_num = ? ORDER BY (annee_scolaire = ?) DESC, annee_scolaire DESC LIMIT 1');
  const unites = (c.pae || []).map(u => {
    const acquise = !!(u.deja_reussie || u.va_complete);
    const etat = acquise ? 'acquise' : u.inscrite ? 'programme' : u.en_attente ? 'attente' : u.accessible ? 'accessible' : 'pas_encore';
    return { ue_num: u.ue_num, ue_nom: u.ue_nom, bloc: u.ue_niv || '—', ects: Number(ects.get(u.ue_num, annee)?.ects) || 0, etat,
      va: !!u.va_complete, epreuve: !!u.epreuve_integree,
      raison: etat === 'pas_encore' ? (u.prereq_manquants?.length ? `prérequis : UE ${u.prereq_manquants.join(', ')}` : u.epreuve_integree ? 'tout le reste d’abord' : null) : null };
  });
  const total = unites.reduce((s, u) => s + u.ects, 0);
  const acquis = unites.filter(u => u.etat === 'acquise').reduce((s, u) => s + u.ects, 0);
  return { annee, sections: c.sections || [], unites, ects_total: total, ects_acquis: acquis };
}

/** Les frais de l'année : ce qui est dû, versé, reste ; l'échéance ; comment payer, avec le QR. */
export async function fraisPortail(e, annee) {
  let f;
  try { f = calculerFrais(e.id, annee); } catch { return null; }
  if (!f) return null;
  const lignes = [
    ['Droit d’inscription', f.exonere_di ? 0 : f.droit_inscription, f.exonere_di ? 'exonéré' : null],
    ['Droit spécifique', f.droit_specifique],
    ['Frais administratifs (part fixe)', f.frais_fixes],
    ['Frais administratifs (par période)', f.frais_variables],
    ['Analyse des demandes de valorisation', f.forfait_va?.du || 0],
  ].filter(([, m, n]) => Number(m) > 0 || n).map(([libelle, montant, note]) => ({ libelle, montant: Number(montant) || 0, note: note || null }));
  const v = f.virement || {};
  return {
    annee, sans_frais: !!f.sans_frais, total: f.total, verse: f.verse, restant: f.restant, acompte: f.acompte,
    acompte_verse: !!f.acompte_verse, echeance_solde: f.echeance_solde, lignes,
    paiements: (f.paiements || []).map(p => ({ date: p.date_paiement, montant: p.montant, nature: p.nature, moyen: p.moyen })),
    virement: f.restant > 0 && v.iban ? { iban: v.iban, beneficiaire: v.beneficiaire, communication: v.communication, montant: v.montant,
      qr: v.epc ? await qrSvg(v.epc, 180) : null } : null,
  };
}
