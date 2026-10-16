/**
 * GESTION → POPULATION → LE PERSONNEL (3.1.376, Charles, 15 octobre 2026 : « dans Gestion je n'ai plus
 * les statistiques liées aux enseignants : sexe, âge… »). Les chiffres de la pièce « Statistiques du
 * personnel », à l'écran, dessinés comme ceux des étudiants : toute l'école ou une section. Le personnel
 * = qui porte une attribution cette année, plus les fonctions d'établissement (direction, secrétariat) ;
 * chacun une fois. Chaque répartition dit sur combien de fiches renseignées elle porte.
 */
import { useEffect, useState } from 'react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Anneau, Barres, couleurSerie } from './graphiques.jsx';
import { TuileEtat } from './ui.jsx';
import { RatiosEtp } from './RapportStatistique.jsx';

const k0 = n => Math.round(n || 0).toLocaleString('fr-BE');
const e2 = n => (n || 0).toFixed(2).replace('.', ',');
const pc = (k, n) => (n ? `${Math.round((k / n) * 100)} %` : '—');
const NOM = s => String(s || '').replace(/_/g, ' ');
const TRANCHES = [['t1', 'moins de 0,10 ETP'], ['t2', '0,10 à 0,25'], ['t3', '0,25 à 0,50'], ['t4', '0,50 à 0,75'], ['t5', '0,75 et plus']];

function Carte({ titre, sous, children }) {
  return (
    <section className="carte p-4 space-y-3 min-w-0">
      <div><div className="titre-carte">{titre}</div>{sous && <div className="text-second text-slate-500">{sous}</div>}</div>
      {children}
    </section>);
}

export default function PersonnelEcole({ annee: anneeProp }) {
  const annee = anneeProp || getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState('');
  useEffect(() => {
    setErreur(null); setD(null);
    fetch(`/api/pilotage/population-personnel?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setD(j); })
      .catch(e => setErreur(e.message));
  }, [annee]);

  if (erreur) return <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>;
  if (!d) return <div className="text-slate-400 py-12 text-center">Chargement…</div>;
  const v = section ? d.sections.find(s => s.section === section) || d.ensemble : d.ensemble;
  const sexeConnu = v.F + v.M + v.X;
  const ageConnu = v.a35 + v.a45 + v.a55 + v.p55;
  const natConnue = v.be + v.ue + v.hors_ue;
  const domConnu = v.bruxelles + v.wallonie + v.flandre;
  const pays = Object.entries(v.pays || {}).filter(([p]) => p !== 'Belgique').sort((a, b) => b[1] - a[1]).slice(0, 10);
  const etpVue = section ? (v.etp_section ?? v.etp) : v.etp;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="segments">
          {[['', 'Toute l’école'], ...d.sections.map(s => [s.section, NOM(s.section)])].map(([k, l]) => (
            <button key={k || 'tout'} type="button" onClick={() => setSection(k)}
              className={section === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>))}
        </div>
        <span className="text-second text-slate-400 ml-auto">{d.annee} · situation au {d.ref.split('-').reverse().join('/')}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[150px]"><TuileEtat etat="fort" valeur={k0(v.n)} libelle="membres du personnel" precision={`${k0(v.enseignant)} enseignant(s) · ${k0(v.adm)} administratif(s)`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={e2(etpVue)} libelle={section ? 'ETP dans la section' : 'ETP'} precision="CT ÷ 800 + PP ÷ 1000 ; fonctions à leur ETP" /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={pc(v.F, sexeConnu)} libelle="de femmes" precision={`${k0(v.F)} F · ${k0(v.M)} M${v.X ? ` · ${k0(v.X)} X` : ''}`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={v.age_moyen != null ? `${Math.round(v.age_moyen)} ans` : '—'} libelle="âge moyen" precision={`${k0(v.p55)} de 55 ans et plus`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={k0(v.definitif)} libelle="définitifs" precision={`${k0(v.temporaire)} temporaire(s)`} /></div>
      </div>

      {/* LE RATIO ÉTUDIANTS PAR ETP, ICI AUSSI (Charles, 16 octobre 2026 : « je ne le vois nulle part ») :
          profs, profs + coordination, tout le personnel ; secrétariat et direction pour l'école. */}
      {!section && (
        <Carte titre="Étudiants par ETP" sous="Étudiants équivalents temps plein pour un ETP : profs, profs + coordination, tout le personnel — par section ; secrétariat et direction pour l'école.">
          <RatiosEtp annee={d.annee} />
        </Carte>)}

      {!section && (
        <Carte titre="Le personnel par section" sous="Un membre qui enseigne dans deux sections compte dans chacune ; le total de l'école le compte une fois.">
          <Barres format={n => k0(n)} lignes={d.sections.map((s, i) => ({ nom: `${NOM(s.section)} · ${e2(s.etp_section)} ETP`, valeur: s.n, couleur: couleurSerie(i) }))} />
        </Carte>)}

      <div className="grid gap-4 lg:grid-cols-2">
        <Carte titre="Sexe" sous={`Sur ${k0(sexeConnu)} fiches renseignées${v.sexe_inconnu ? ` · ${k0(v.sexe_inconnu)} sans sexe` : ''}`}>
          <Anneau centre={k0(sexeConnu)} parts={[{ nom: 'Femmes', valeur: v.F, couleur: 'var(--g-3)' }, { nom: 'Hommes', valeur: v.M, couleur: 'var(--g-1)' }, { nom: 'X', valeur: v.X, couleur: 'var(--g-2)' }]} />
        </Carte>
        <Carte titre="Âge" sous={`Sur ${k0(ageConnu)} dates de naissance${v.age_inconnu ? ` · ${k0(v.age_inconnu)} inconnues` : ''}`}>
          <Barres format={n => `${k0(n)} · ${pc(n, ageConnu)}`} lignes={[
            { nom: 'moins de 35 ans', valeur: v.a35 }, { nom: '35 à 44 ans', valeur: v.a45 },
            { nom: '45 à 54 ans', valeur: v.a55 }, { nom: '55 ans et plus', valeur: v.p55 }]} />
        </Carte>
        <Carte titre="Statut" sous="Chargé de cours, expert, administratif ; et la nomination.">
          <Barres format={n => `${k0(n)} · ${pc(n, v.n)}`} lignes={[
            { nom: 'Chargés de cours (CC)', valeur: v.cc }, { nom: 'Experts (EXP)', valeur: v.exp },
            { nom: 'Administratifs', valeur: v.adm }, { nom: 'Autre ou non renseigné', valeur: v.autre_statut },
            { nom: 'Définitifs', valeur: v.definitif }, { nom: 'Temporaires', valeur: v.temporaire }].filter(x => x.valeur)} />
        </Carte>
        <Carte titre="Charge" sous="Les ETP de chacun, toutes sections confondues.">
          <Barres format={n => `${k0(n)} · ${pc(n, v.n)}`} lignes={TRANCHES.map(([k, l]) => ({ nom: `${l} · ${e2(v[`${k}_etp`])} ETP`, valeur: v[k] }))} />
        </Carte>
        <Carte titre="Domicile" sous={`Région du code postal · sur ${k0(domConnu)} adresses belges${v.domicile_inconnu ? ` · ${k0(v.domicile_inconnu)} sans code postal belge` : ''}`}>
          <Anneau centre={k0(domConnu)} parts={[{ nom: 'Bruxelles', valeur: v.bruxelles, couleur: 'var(--g-1)' }, { nom: 'Wallonie', valeur: v.wallonie, couleur: 'var(--g-2)' }, { nom: 'Flandre', valeur: v.flandre, couleur: 'var(--g-3)' }]} />
        </Carte>
        <Carte titre="Nationalité" sous={`Sur ${k0(natConnue)} nationalités renseignées${v.nat_inconnue ? ` · ${k0(v.nat_inconnue)} inconnues` : ''}`}>
          <Anneau centre={k0(natConnue)} parts={[{ nom: 'Belges', valeur: v.be, couleur: 'var(--g-1)' }, { nom: 'Union européenne', valeur: v.ue, couleur: 'var(--g-2)' }, { nom: 'Hors Union européenne', valeur: v.hors_ue, couleur: 'var(--g-3)' }]} />
          {pays.length > 0 && <>
            <div className="intertitre pt-1">Les autres nationalités</div>
            <Barres format={n => `${k0(n)} · ${pc(n, natConnue)}`} lignes={pays.map(([nom, n]) => ({ nom, valeur: n }))} />
          </>}
        </Carte>
        <Carte titre="Employeur et titres" sous="IIP, HELB (un membre peut relever des deux) ; titres pédagogiques encodés.">
          <Barres format={n => `${k0(n)} · ${pc(n, v.n)}`} lignes={[
            { nom: 'Contrat IIP', valeur: v.iip }, { nom: 'Contrat HELB', valeur: v.helb },
            { nom: 'CAPAES', valeur: v.capaes }, { nom: 'Au moins un titre encodé', valeur: v.avec_titres }]} />
        </Carte>
      </div>
    </div>);
}
