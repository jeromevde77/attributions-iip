/* Banc d'essai de la carte d'identité et du compte bancaire de l'étudiant (24 novembre 2026) :
   contrôle de l'IBAN (longueur du pays, modulo 97), du BIC, de la date, et retrait des champs pour
   la coordination et les professeurs. Fonctions pures, aucune base. */
import { ibanValide } from '../src/lib/banque.js';
import { verifierCompte, masquerCompte, CHAMPS_COMPTE } from '../src/lib/compteEtudiant.js';

let ok = 0, faux = 0;
const voir = (nom, cond) => { if (cond) ok++; else { faux++; console.log('FAUX :', nom); } };

// IBAN : la règle commune à l'établissement et à l'étudiant.
voir('belge valide, groupé', ibanValide('be68 5390 0754 7034') === 'BE68 5390 0754 7034');
voir('belge, chiffre de contrôle faux', ibanValide('BE68539007547035') === null);
voir('belge trop long (longueur du pays)', ibanValide('BE685390075470340') === null);
voir('français valide', ibanValide('FR1420041010050500013M02606') === 'FR14 2004 1010 0505 0001 3M02 606');
voir('néerlandais valide', ibanValide('NL91ABNA0417164300') !== null);
voir('points et tirets tolérés', ibanValide('BE68-5390-0754-7034') !== null);
voir('texte refusé', ibanValide('mon compte') === null);

// Écriture : formes rangées, erreurs dites.
const v = verifierCompte({ iban: 'be68 5390 0754 7034', bic: 'gkcc be bb', carte_identite_fin: '2031-05-12', carte_identite_numero: '592-1234567-89', titulaire_compte: ' Marie DUPONT ' });
voir('IBAN rangé sans espaces, en capitales', v.valeurs?.iban === 'BE68539007547034');
voir('BIC rangé', v.valeurs?.bic === 'GKCCBEBB');
voir('date gardée', v.valeurs?.carte_identite_fin === '2031-05-12');
voir('titulaire nettoyé', v.valeurs?.titulaire_compte === 'Marie DUPONT');
voir('IBAN faux → phrase', /IBAN valide/.test(verifierCompte({ iban: 'BE68539007547035' }).erreur || ''));
voir('BIC faux → phrase', /BIC/.test(verifierCompte({ bic: 'ABC' }).erreur || ''));
voir('date impossible refusée', !!verifierCompte({ carte_identite_fin: '2031-02-30' }).erreur);
voir('date mal formée refusée', !!verifierCompte({ carte_identite_fin: '12/05/2031' }).erreur);
voir('vide → effacé', verifierCompte({ iban: '' }).valeurs?.iban === null);
voir('champ absent → rien', Object.keys(verifierCompte({ nom: 'X' }).valeurs).length === 0);

// Qui voit : direction et secrétariat seulement.
const fiche = { id: 1, nom: 'DUPONT', iban: 'BE68539007547034', bic: 'GKCCBEBB', titulaire_compte: null, carte_identite_fin: '2031-05-12', carte_identite_numero: 'X' };
for (const role of ['coordination', 'professeur', 'conseiller_qualite', 'consultation']) {
  const m = masquerCompte(fiche, { role });
  voir(`${role} : champs retirés`, CHAMPS_COMPTE.every(c => !(c in m)) && m.nom === 'DUPONT');
}
for (const role of ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur']) {
  voir(`${role} : champs gardés`, masquerCompte(fiche, { role }).iban === 'BE68539007547034');
}
voir('sans utilisateur : retirés', !('iban' in masquerCompte(fiche, null)));
voir('la fiche d’origine intacte', fiche.iban === 'BE68539007547034');

console.log(`${ok} ok, ${faux} faux`);
process.exit(faux ? 1 : 0);
