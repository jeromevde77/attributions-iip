import { useEffect, useRef, useState } from 'react';
import { IconUpload, IconCheck, IconTrash, IconFileSpreadsheet, IconFileTypePdf } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { saisir } from '../lib/dialogue.jsx';
import { EnteteCarte, Tableau, Th, Td, Tr, TrTotal } from './ui.jsx';

/* LES SOURCES DES RÉFÉRENTIELS (3.5.450, Charles, 14 novembre 2026 : « j'essaie de te donner tout ce que je trouve comme données
   pour que nous puissions croiser les données et avoir des bases solides » ; tranché : « oui, et j'y dépose les fichiers »).
   Gestion → Vue d'ensemble → Les sources (direction). On dépose un fichier ; Lucie le reconnaît à son contenu, MONTRE ce qu'elle en
   garderait — des totaux, jamais une personne —, et ne l'écrit qu'après « Garder ces totaux ». Le fichier lui-même n'est pas conservé.
   Chaque comparaison de « Lire et comparer » lit la source la plus récente de sa sorte. */

const n0 = v => (v == null ? '—' : Math.round(v).toLocaleString('fr-BE'));
const n1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('fr-BE'));
const eur = v => (v == null ? '—' : `${n0(v)} €`);
const jour = d => (d ? new Date(String(d).replace(' ', 'T')).toLocaleDateString('fr-BE') : '—');

/* Les exercices réalisés de la synthèse de l'ASBL : un réalisé vide est tu ; un réalisé bien en dessous de son budget (exercice en
   cours, exécution provisoire) est montré mais ne sert pas de référence — la règle du serveur (dernierRealise). */
function realises(t) {
  const tot = t.postes?.find(p => p.bloc === 'ASBL');
  return [...new Set((t.exercices || []).filter(e => e.nature === 'realise').map(e => e.annee))].sort().map(a => {
    const r = tot?.ex?.[`${a}|realise`], b = tot?.ex?.[`${a}|budget`] || tot?.ex?.[`${a}|ajuste`] || tot?.ex?.[`${a}|initial`];
    return { annee: a, charges: r?.charges || 0, complet: !!r?.charges && (!b?.charges || r.charges > b.charges * 0.85) };
  }).filter(x => x.charges > 0);
}
/* Ce que Lucie retient d'une source, en chiffres lisibles. */
function chiffres(nature, t) {
  if (nature === 'helb_cor') return [['Rémunérations, total', eur(t.total)], ['Enseignement (statutaires + invités)', eur(t.enseignement)],
    ['Encadrement (direction, administration)', `${eur(t.encadrement)} · ${t.enseignement ? Math.round((t.encadrement / t.enseignement) * 100) : '—'} % de l’enseignement`],
    ['ETP d’enseignants statutaires', n1(t.etp_enseignants)], ['Allocation globale', eur(t.allocation)]];
  if (nature === 'helb_attributions') return [['ETP d’enseignement', n1(t.enseignement)], ['ETP de fonctions dans les cursus', `${n1(t.fonctions)} · ${Math.round((t.fonctions_sur_enseignement || 0) * 100)} % de l’enseignement`],
    ['ETP des départements', n1(t.departements)], ['ETP d’administration et services', n1(t.administration)], ['Cursus lus', n0(t.cursus?.length)]];
  if (nature === 'helb_inscrits') return [['Inscrits, tous cursus', n0(t.total)], ['Cursus', n0(t.cursus?.length)], ['Feuille retenue', t.feuille || '—']];
  if (nature === 'asbl_comptes') return [['Exercice', t.exercice || '—'], ['Charges d’exploitation', eur(t.charges)], ['Rémunérations', eur(t.remunerations)],
    ['Fonctionnement (services, amortissements, autres)', eur(t.fonctionnement)], ['Subsides', eur(t.subsides)], ['Résultat de l’exercice', eur(t.resultat)], ['ETP déclarés par l’ASBL', n1(t.etp_declares)]];
  if (nature === 'asbl_synthese') {
    const R = realises(t);
    return [['Exercices réalisés complets', R.filter(x => x.complet).map(x => x.annee).join(' · ') || '—'], ['Postes lus (services, départements, cursus)', n0(t.postes?.length)],
      ...R.map(x => [`Charges de l’ASBL, réalisé ${x.annee}${x.complet ? '' : ' — exercice en cours ou provisoire, non retenu'}`, eur(x.charges)])];
  }
  return [];
}

function Detail({ nature, t }) {
  if (nature === 'helb_attributions' || nature === 'helb_inscrits') {
    const L = t.cursus || [];
    return (
      <Tableau className="!border-0 !rounded-none" dense>
        <thead><tr className="tab-entete"><Th>Cursus</Th>{nature === 'helb_attributions' ? <><Th align="droite">Enseignement</Th><Th align="droite">Fonctions</Th></> : <Th align="droite">Inscrits</Th>}</tr></thead>
        <tbody>{L.map((c, i) => (
          <Tr key={i}><Td>{c.dept ? <span className="text-slate-400">{c.dept} · </span> : null}{c.cursus}</Td>
            {nature === 'helb_attributions' ? <><Td align="droite">{n1(c.enseignement)}</Td><Td align="droite">{n1(c.fonctions)}</Td></> : <Td align="droite">{n0(c.inscrits)}</Td>}</Tr>))}</tbody>
      </Tableau>);
  }
  if (nature === 'asbl_synthese') {
    const reals = realises(t).filter(x => x.complet).map(x => x.annee).slice(-2);
    const tot = t.postes?.find(p => p.bloc === 'ASBL');
    return (
      <Tableau className="!border-0 !rounded-none" dense>
        <thead><tr className="tab-entete"><Th>Poste</Th>{reals.map(a => <Th key={a} align="droite" colSpan={3}>Réalisé {a} — charges · produits · résultat</Th>)}</tr></thead>
        <tbody>
          {tot && <TrTotal><Td>{tot.poste}</Td>{reals.flatMap(a => { const v = tot.ex[`${a}|realise`] || {}; return [<Td key={a + 'c'} align="droite">{n0(v.charges)}</Td>, <Td key={a + 'p'} align="droite">{n0(v.produits)}</Td>, <Td key={a + 'r'} align="droite">{n0(v.resultat)}</Td>]; })}</TrTotal>}
          {(t.postes || []).filter(p => p.bloc !== 'ASBL').map((p, i) => (
            <Tr key={i}><Td><span style={{ paddingLeft: p.niveau * 14 }} className={p.niveau === 0 ? 'font-semibold' : ''}>{p.poste}{p.niveau > 0 && p.bloc !== 'HELB' ? <span className="text-slate-400"> · {p.bloc.replace('Institut Ilya Prigogine', 'IIP')}</span> : null}</span></Td>
              {reals.flatMap(a => { const v = p.ex[`${a}|realise`] || {}; return [<Td key={a + 'c'} align="droite">{n0(v.charges)}</Td>, <Td key={a + 'p'} align="droite">{n0(v.produits)}</Td>, <Td key={a + 'r'} align="droite">{n0(v.resultat)}</Td>]; })}</Tr>))}
        </tbody>
      </Tableau>);
  }
  return null;
}

export default function SourcesReference() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [lu, setLu] = useState(null);          // { fichier, contenu, apercu }
  const [fourni, setFourni] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [ouvert, setOuvert] = useState(null);
  const champ = useRef(null);

  const charger = () => fetch('/api/pilotage/sources', { headers: authHeaders() })
    .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setD(j); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);

  const choisir = async f => {
    if (!f) return;
    setErreur(null); setLu(null); setEnCours(true);
    try {
      const contenu = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(new Error('Lecture du fichier impossible.')); r.readAsDataURL(f); });
      const r = await fetch('/api/pilotage/sources/lire', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ nom: f.name, contenu }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setLu({ fichier: f.name, contenu, apercu: j });
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); if (champ.current) champ.current.value = ''; }
  };
  const garder = async () => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/pilotage/sources', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ nom: lu.fichier, contenu: lu.contenu, fourni_par: fourni || null }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setLu(null); setFourni(''); await charger();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const retirer = async s => {
    const motif = await saisir({ titre: 'Retirer cette source', message: `« ${s.fichier} » ne servira plus aux comparaisons ; elle reste listée. Pourquoi la retirer ?`, libelle: 'Motif' });
    if (!motif) return;
    const r = await fetch(`/api/pilotage/sources/${s.id}`, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ motif }) });
    if (!r.ok) setErreur((await r.json().catch(() => ({}))).error || 'La source n’a pas été retirée.'); else charger();
  };

  const sources = d?.sources || [];
  const enVigueur = {}; for (const s of sources) if (!s.retire_le && !enVigueur[s.nature]) enVigueur[s.nature] = s;
  return (
    <div className="space-y-3">
      <div className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-1">
        <input ref={champ} type="file" accept=".xlsx,.xlsm,.pdf" className="hidden" onChange={e => choisir(e.target.files?.[0])} />
        <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5 whitespace-nowrap flex-none" disabled={enCours} onClick={() => champ.current?.click()}>
          <IconUpload size={15} />{enCours ? 'Lecture…' : 'Déposer un fichier'}</button>
        <span className="text-second text-slate-500 whitespace-nowrap">Excel ou PDF · Lucie le lit, garde les totaux, et ne conserve ni le fichier ni aucune donnée de personne.</span>
      </div>
      {erreur && <div className="bloc-etat px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}

      {lu && (
        <section className="carte overflow-hidden">
          <EnteteCarte titre={`Reconnu : ${lu.apercu.libelle}`} sous={`${lu.fichier}${lu.apercu.date_donnee ? ` · données du ${jour(lu.apercu.date_donnee)}` : ''}${lu.apercu.annee ? ` · ${lu.apercu.annee}` : ''}`} />
          <div className="p-3 space-y-3">
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {chiffres(lu.apercu.nature, lu.apercu.totaux).map(([l, v]) => <div key={l} className="flex justify-between gap-3 text-second border-b border-slate-100 py-1"><span className="text-slate-600">{l}</span><b className="tabular-nums text-right">{v}</b></div>)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-second text-slate-600">Fourni par
                <input className="controle w-56" value={fourni} onChange={e => setFourni(e.target.value)} placeholder="ex. : direction financière de la HELB" /></label>
              <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={enCours} onClick={garder}><IconCheck size={15} />Garder ces totaux</button>
              <button type="button" className="bouton" onClick={() => setLu(null)}>Ne rien garder</button>
              {enVigueur[lu.apercu.nature] && <span className="text-second text-slate-500">Remplacera « {enVigueur[lu.apercu.nature].fichier} » dans les comparaisons.</span>}
            </div>
          </div>
        </section>)}

      {!d ? <p className="text-second text-slate-400">Chargement…</p> : (<>
        <div className="grid gap-3 md:grid-cols-2 items-stretch">
          {Object.entries(d.natures).map(([k, lib]) => { const s0 = enVigueur[k]; const s = k === 'asbl_synthese' && s0 && d.synthese ? { ...s0, totaux: d.synthese.totaux, reunis: d.synthese.fichiers } : s0; return (
            <section key={k} className="carte overflow-hidden h-full">
              <EnteteCarte icone={k === 'asbl_comptes' ? IconFileTypePdf : IconFileSpreadsheet} titre={lib} sous={s ? `${s.fichier} · déposé le ${jour(s.depose_le)} par ${s.depose_par || '—'}${s.fourni_par ? ` · fourni par ${s.fourni_par}` : ''}` : 'aucun fichier déposé'}>
                {s && <button type="button" className="text-slate-400 hover:text-slate-700" title="Retirer cette source" aria-label="Retirer cette source" onClick={() => retirer(s)}><IconTrash size={15} /></button>}
              </EnteteCarte>
              {!s ? <p className="p-3 text-second text-slate-500 m-0">{k === 'helb_cor' || k === 'helb_attributions' || k === 'helb_inscrits' ? 'À défaut, les comparaisons utilisent les totaux repris le 14 novembre 2026.' : 'Sans ce fichier, cette référence reste « à calculer ».'}</p> : (
                <div className="p-3">
                  {s.reunis?.length > 1 && <p className="text-second text-slate-500 mt-0 mb-2">Classeurs réunis : {s.reunis.map(f => `${f.fichier} (${f.annees[0]}–${f.annees[f.annees.length - 1]})`).join(' ; ')}. Le plus récent fait foi pour ses années.</p>}
                  {chiffres(k, s.totaux).map(([l, v]) => <div key={l} className="flex justify-between gap-3 text-second border-b border-slate-100 last:border-0 py-1"><span className="text-slate-600">{l}</span><b className="tabular-nums text-right">{v}</b></div>)}
                  {['helb_attributions', 'helb_inscrits', 'asbl_synthese'].includes(k) && (
                    <button type="button" className="text-second text-iip-blue mt-2" onClick={() => setOuvert(o => (o === k ? null : k))}>{ouvert === k ? 'Replier le détail' : 'Voir le détail retenu'}</button>)}
                </div>)}
              {s && ouvert === k && <div className="overflow-x-auto border-t border-slate-100"><Detail nature={k} t={s.totaux} /></div>}
            </section>); })}
        </div>
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Tout ce qui a été déposé" sous="la source la plus récente de chaque sorte sert aux comparaisons ; une source retirée reste listée" />
          <div className="overflow-x-auto">
            <Tableau className="!border-0 !rounded-none">
              <thead><tr className="tab-entete"><Th>Sorte</Th><Th>Fichier</Th><Th>Données du</Th><Th>Fourni par</Th><Th>Déposé</Th><Th>État</Th></tr></thead>
              <tbody>
                {!sources.length && <Tr><Td colSpan={6}><span className="text-slate-500">Rien encore : déposez un premier fichier.</span></Td></Tr>}
                {sources.map(s => (
                  <Tr key={s.id}><Td>{d.natures[s.nature] || s.nature}</Td><Td>{s.fichier}</Td><Td>{jour(s.date_donnee)}</Td><Td>{s.fourni_par || '—'}</Td>
                    <Td>{jour(s.depose_le)} · {s.depose_par || '—'}</Td>
                    <Td>{s.retire_le ? <span className="text-slate-500" title={s.remarque || ''}>retirée le {jour(s.retire_le)}</span> : enVigueur[s.nature]?.id === s.id ? <b style={{ color: 'var(--c-reussi)' }}>en vigueur</b> : <span className="text-slate-500">remplacée</span>}</Td></Tr>))}
              </tbody>
            </Tableau>
          </div>
        </section>
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Les chiffres repris dans Lucie sans fichier déposé" sous="des données de référence reprises une fois ; un dépôt les remplace" />
          <div className="px-4 py-2">
            {d.integrees.map(x => <div key={x.libelle} className="text-second py-1.5 border-b border-slate-100 last:border-0"><b>{x.libelle}</b>{x.annee ? ` (${x.annee})` : ''} — <span className="text-slate-600">{x.source}</span></div>)}
          </div>
        </section>
      </>)}
    </div>);
}
