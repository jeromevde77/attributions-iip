import { couleurBloc } from '../lib/blocs.js';

/* LE PETIT TRAIN D'UNE UNITÉ (3.5.156-157, Charles : « on ne comprend pas si c'est Bac 1, 2… il faut le mini train » ; « je veux
   la même pour mes présences ») : le dessin de la fiche de l'étudiant dans Lucie — section, bloc (liseré à la couleur du bloc),
   ECTS, cours, étudiants. Un seul composant : Mes étudiants de l'espace, Mes notes et Mes présences. */
export function Wagon({ v, l, ligne = false }) {
  return (
    <span className="relative px-2.5 py-1 leading-tight">
      <span className="block text-sm font-semibold text-iip-texte tabular-nums">{v}</span>
      {l && <span className="block text-mention text-slate-500">{l}</span>}
      {ligne && <span className="absolute left-1.5 right-1.5 bottom-0 h-[3px] rounded-full bg-blue-700" />}
    </span>);
}

export default function TrainUE({ section, niveau, ects, nbCours, nbEtudiants }) {
  return (
    <span className="bloc-etat etat-neutre inline-flex items-stretch divide-x divide-slate-200 bg-white"
      style={{ borderLeftColor: couleurBloc(niveau) || 'rgb(var(--gris-200))' }}>
      <Wagon v={section || '—'} l="section" />
      <Wagon v={niveau || '—'} l="bloc" ligne />
      {ects != null && <Wagon v={ects} l="ECTS" />}
      {nbCours != null && <Wagon v={nbCours} l="cours" />}
      {nbEtudiants != null && <Wagon v={nbEtudiants} l={nbEtudiants > 1 ? 'étudiants' : 'étudiant'} />}
    </span>);
}
