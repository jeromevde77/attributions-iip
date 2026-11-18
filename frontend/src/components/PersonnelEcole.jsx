/**
 * GESTION → POPULATION → LE PERSONNEL (3.1.376, Charles, 15 octobre 2026 : « dans Gestion je n'ai plus
 * les statistiques liées aux enseignants : sexe, âge… »). Les chiffres de la pièce « Statistiques du
 * personnel », à l'écran, dessinés comme ceux des étudiants : toute l'école ou une section. Le personnel
 * = qui porte une attribution cette année, plus les fonctions d'établissement (direction, secrétariat) ;
 * chacun une fois. Chaque répartition dit sur combien de fiches renseignées elle porte.
 */
import { useEffect, useRef, useState } from 'react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Anneau, Barres, couleurSerie } from './graphiques.jsx';
import { TuileEtat, Tableau, TableauEntete, Th, Td, Tr } from './ui.jsx';
import { RatiosEtp } from './RapportStatistique.jsx';
import { Disque, ComparerA, Partie, Chiffres } from './Disques.jsx';

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

/* PAR SECTION, ET COMPARÉ (3.5.481, Charles, 16 novembre 2026 : « imprimer aussi le personnel par section ; jeudi je ne vais parler que
   du TIM, et le comparer aux données de l'IIP ou de l'ASBL »). `initial` / `onChoix` : la section de l'écran, que l'impression suit
   (comme Qui sont nos étudiants). Une section choisie porte la carte « Comparé à l'IIP et à l'ASBL » : le profil du personnel face à
   l'IIP (même source) ; l'ASBL seulement pour ce qui se compte en ETP (Lire et comparer : GET /api/pilotage/lecture) — Lucie ne garde
   pas de fiche nominative du personnel de la HELB. */
export default function PersonnelEcole({ annee: anneeProp, initial = null, onChoix = null, seulCompare = false }) {
  const annee = anneeProp || getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState(initial?.section ?? '');
  const [lec, setLec] = useState(null);
  useEffect(() => { if (onChoix) onChoix({ section, sections: (d?.sections || []).map(s => s.section) }); }, [section, d]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!section || lec) return;
    fetch(`/api/pilotage/lecture?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setLec).catch(() => {});
  }, [section, annee]);   // eslint-disable-line react-hooks/exhaustive-deps
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
  // La fiche d'une section (3.5.558) : la carte des enseignants seule, telle que la maquette validée.
  if (seulCompare && section) return <Compare v={v} iip={d.ensemble} section={section} etpVue={etpVue} lec={lec} />;

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
        <div className="flex-1 min-w-[150px]"><TuileEtat aide="Attributions de l’année : CT ÷ 800 + PP ÷ 1 000 ; les fonctions (direction, coordinations…) à leur ETP encodé. Lignes en congé exclues." valeur={e2(etpVue)} libelle={section ? 'ETP dans la section' : 'ETP'} precision="CT ÷ 800 + PP ÷ 1000 ; fonctions à leur ETP" /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={pc(v.F, sexeConnu)} libelle="de femmes" precision={`${k0(v.F)} F · ${k0(v.M)} M${v.X ? ` · ${k0(v.X)} X` : ''}`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={v.age_moyen != null ? `${Math.round(v.age_moyen)} ans` : '—'} libelle="âge moyen" precision={`${k0(v.p55)} de 55 ans et plus`} /></div>
        <div className="flex-1 min-w-[150px]"><TuileEtat valeur={k0(v.definitif)} libelle="définitifs" precision={`${k0(v.temporaire)} temporaire(s)`} /></div>
      </div>

      {/* LE RATIO ÉTUDIANTS PAR ETP, ICI AUSSI (Charles, 16 octobre 2026 : « je ne le vois nulle part ») :
          profs, profs + coordination, tout le personnel ; secrétariat et direction pour l'école. */}
      {section && !seulCompare && <Compare v={v} iip={d.ensemble} section={section} etpVue={etpVue} lec={lec} />}

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

/* LA SECTION FACE À L'IIP ET À L'ASBL (3.5.481). Parts calculées sur les fiches renseignées, comme les cartes de la page. */
/* LES ENSEIGNANTS DE LA SECTION, EN DISQUES RANGÉS PAR TYPE (3.5.552, maquette validée : « des graphiques en disques plutôt que des
   nombres, triés par type » ; « comparer à » réglé par partie). Quatre tuiles (les ratios, que l'ASBL connaît aussi), puis les profils.
   L'ASBL : Lucie n'a pas les fiches du personnel de la HELB — ses disques disent « non disponible ». */
function Compare({ v, iip, section, etpVue, lec }) {
  const [ref, setRef] = useState('IIP');
  // La largeur de la carte décide des colonnes de disques (3.5.568-569) : quatre groupes sur une rangée seulement s'ils y tiennent.
  const boite = useRef(null);
  const [largeur, setLargeur] = useState(0);
  useEffect(() => {
    const el = boite.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setLargeur(Math.round(e.contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const LS = lec?.sections?.find(x => x.section === section) || null, LI = lec?.iip || null, LA = lec?.asbl || null;
  const part = (o, k, base) => { const b = o && base(o); return b ? ((o[k] || 0) / b) * 100 : null; };
  const sexe = o => o.F + o.M + o.X, age = o => o.a35 + o.a45 + o.a55 + o.p55, nat = o => o.be + o.ue + o.hors_ue, dom = o => o.bruxelles + o.wallonie + o.flandre, tous = o => o.n;
  const f1 = x => (x == null ? '—' : x.toLocaleString('fr-BE', { maximumFractionDigits: 1 }));
  const R = ref === 'ASBL' ? null : iip;          // l'ASBL n'a pas de fiches du personnel
  const RL = ref === 'ASBL' ? LA : LI;
  const d = (nom, k, base, couleur) => ({ nom, valeur: part(v, k, base), reference: R ? part(R, k, base) : null, couleur });
  const GROUPES = [
    ['Profil', [d('Femmes', 'F', sexe, 'var(--c-principal)'), d('55 ans et plus', 'p55', age, '#19537E')]],
    ['Statut', [d('Chargés de cours', 'cc', tous, 'var(--c-principal)'), d('Experts', 'exp', tous, '#F9B619'), d('Définitifs', 'definitif', tous, 'var(--c-reussi)')]],
    ['Contrat et qualification', [d('Contrat HELB', 'helb', tous, '#05B7E6'), d('CAPAES', 'capaes', tous, '#19537E')]],
    ['Origine', [d('Bruxelles', 'bruxelles', dom, '#19537E'), d('Belges', 'be', nat, '#F9B619')]],
  ];
  const tuiles = [
    [f1(LS?.etc_etp), 'étudiants par ETP', RL?.etc_etp ?? RL?.etu_etp],
    [f1(LS?.taille_groupes), 'étudiants par groupe', RL?.taille_groupes],
    [v.age_moyen != null ? `${Math.round(v.age_moyen)} ans` : '—', 'âge moyen', ref === 'IIP' && iip.age_moyen != null ? `${Math.round(iip.age_moyen)} ans` : null],
    [e2(etpVue), `ETP · ${k0(v.n)} membres`, ref === 'IIP' ? `${e2(iip.etp)} ETP · ${k0(iip.n)}` : LA?.etp != null ? `${f1(LA.etp)} ETP` : null],
  ];
  return (
    <Partie titre="Les enseignants" sous={`${k0(v.n)} membres · ${e2(etpVue)} ETP · rangés par type`} droite={<ComparerA valeur={ref} onChange={setRef} />}>
      {/* SANS CADRE DANS LE CADRE (3.5.556) : les chiffres en ligne, puis les groupes séparés par un filet. */}
      <Chiffres items={tuiles.map(([val, lib, r]) => [val, lib, `${ref} : ${r == null ? 'non disponible' : typeof r === 'number' ? f1(r) : r}`])} />
      {/* DEUX COLONNES TANT QUE LA PLACE MANQUE (3.5.568, capture de Charles : « Origine » coupée) : neuf disques ne tiennent sur une
          rangée qu'en très grand écran. */}
      <div ref={boite} className="grid border-t border-slate-100" style={{ gridTemplateColumns: largeur >= 1100 ? '1fr 1.5fr 1fr 1fr' : largeur >= 560 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
        {GROUPES.map(([titre, ds]) => (
          <div key={titre} className="px-3.5 py-3 space-y-2 border-b border-slate-100 min-w-0">
            <div className="text-mention font-bold uppercase tracking-wider text-slate-500">{titre}</div>
            <div className="flex justify-around gap-1.5">{ds.map(x => <Disque key={x.nom} {...x} nomRef={ref} taille={84} />)}</div>
          </div>))}
      </div>
      {/* L'ÂGE EN BARRES, SOUS LES DISQUES (maquette validée, 3.5.558) — le sexe est déjà dans « Profil ». */}
      <div className="grid grid-cols-1 md:grid-cols-2 border-t border-slate-100 md:divide-x divide-slate-100">
        <div className="px-4 py-3 space-y-1.5">
          <div className="text-mention font-bold uppercase tracking-wider text-slate-500">Âge</div>
          {[['moins de 35 ans', v.a35], ['35 à 44 ans', v.a45], ['45 à 54 ans', v.a55], ['55 ans et plus', v.p55]].map(([l, n]) => {
            const t = age(v) || 0, p = t ? Math.round((n / t) * 100) : 0;
            return (
              <div key={l} className="grid grid-cols-[110px_1fr_70px] items-center gap-2.5 text-second">
                <span>{l}</span>
                <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded" style={{ width: `${p}%`, background: '#19537E' }} /></div>
                <span className="text-right tabular-nums">{n} · {p} %</span>
              </div>);
          })}
        </div>
        <div className="px-4 py-3 space-y-1 text-second text-slate-600">
          <div className="text-mention font-bold uppercase tracking-wider text-slate-500">À savoir</div>
          <div>{age(v)} dates de naissance connues sur {k0(v.n)}{v.n - age(v) > 0 ? ` · ${k0(v.n - age(v))} inconnues` : ''}.</div>
          <div>L’ASBL : Lucie n’a pas les fiches du personnel de la HELB ; seuls les ratios en ETP se comparent.</div>
        </div>
      </div>
      {!lec && <div className="px-4 pb-3 text-mention text-slate-400">Les ratios de l’IIP et de l’ASBL se chargent…</div>}
    </Partie>);
}
