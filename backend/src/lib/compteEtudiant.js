/**
 * LA CARTE D'IDENTITÉ ET LE COMPTE BANCAIRE DE L'ÉTUDIANT (idées #50 de Mati AEVALIOTIS et #36
 * de Florian DAELEMAN, retenues par Charles le 24 novembre 2026 : « ajouter dans la fiche de
 * l'étudiant la date de validité de la carte d'identité, et un espace pour encoder le compte en
 * banque »). Le compte sert aux remboursements de frais (un versement négatif, Fiche → Finances) ;
 * la carte, à savoir quand redemander une pièce à jour.
 *
 * QUI LES VOIT : la direction et le secrétariat, et personne d'autre. Ce sont des données dont la
 * coordination et les enseignants n'ont pas l'usage — la règle des données privées (n° national,
 * adresse) appliquée ici dès la fiche : `masquerCompte` les RETIRE de la réponse, une valeur cachée
 * à l'écran partirait encore dans le réseau. Les listes (routes/listes.js) ne les proposent pas.
 *
 * Un seul endroit pour la règle d'écriture (`verifierCompte`) : la fiche (PATCH) et la création
 * (POST, carte eID) la lisent toutes deux.
 */
import { ibanValide } from './banque.js';

/** Les colonnes ajoutées à `etudiant` (migration dans server.js, avant le journal des modifications). */
export const CHAMPS_COMPTE = ['iban', 'bic', 'titulaire_compte', 'carte_identite_fin', 'carte_identite_numero'];

/** Direction et secrétariat (`editeur` compris, l'équivalent du secrétariat). */
export const ROLES_COMPTE = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur'];

export const voitCompte = user => ROLES_COMPTE.includes(user?.role);

/** La fiche d'un étudiant, sans ces champs pour qui n'en a pas l'usage. */
export function masquerCompte(fiche, user) {
  if (!fiche || voitCompte(user)) return fiche;
  const f = { ...fiche };
  for (const c of CHAMPS_COMPTE) delete f[c];
  return f;
}

const dateValide = s => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};

/**
 * Contrôle et met en forme ce qui arrive pour ces champs. `corps` : les seuls champs présents.
 * Rend { valeurs } (prêtes à écrire ; '' devient null) ou { erreur } (une phrase pour l'écran).
 * L'IBAN se range sans espaces, en capitales ; le BIC aussi ; une date en AAAA-MM-JJ.
 */
export function verifierCompte(corps) {
  const valeurs = {};
  for (const c of CHAMPS_COMPTE) {
    if (!(c in (corps || {}))) continue;
    const brut = corps[c] == null ? '' : String(corps[c]).trim();
    if (!brut) { valeurs[c] = null; continue; }
    if (c === 'iban') {
      const v = ibanValide(brut);
      if (!v) return { erreur: 'Le numéro de compte n’est pas un IBAN valide (longueur du pays ou chiffres de contrôle) : vérifiez-le sur la carte bancaire ou l’extrait.' };
      valeurs.iban = v.replace(/\s+/g, '');
    } else if (c === 'bic') {
      const v = brut.replace(/\s+/g, '').toUpperCase();
      if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v)) return { erreur: 'Le BIC attendu a 8 ou 11 caractères (par exemple GEBABEBB).' };
      valeurs.bic = v;
    } else if (c === 'carte_identite_fin') {
      if (!dateValide(brut)) return { erreur: 'La date de fin de validité de la carte d’identité n’est pas une date valide.' };
      valeurs[c] = brut;
    } else if (c === 'carte_identite_numero') {
      if (brut.length > 30) return { erreur: 'Le numéro de carte d’identité est trop long.' };
      valeurs[c] = brut.toUpperCase();
    } else {
      if (brut.length > 120) return { erreur: 'Le nom du titulaire du compte est trop long.' };
      valeurs[c] = brut;
    }
  }
  return { valeurs };
}
