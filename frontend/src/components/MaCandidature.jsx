import { useEffect, useMemo, useState } from 'react';
import { IconTrash, IconEye } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Encadre, PastilleEtat, EnteteCarte } from './ui.jsx';
import { demander } from '../lib/dialogue.jsx';

/* MA CANDIDATURE (3.5.229) — les formulaires 013 (définitif) et 014 (temporaire), dans l'espace enseignant. La situation de l'année
   en cours vient de Lucie ; on coche ce qu'on demande, on choisit les cours ou les unités, on confirme les conditions légales, on
   dépose : le dépôt vaut accusé de réception. Serveur : /api/candidatures/moi. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const ETAT = { deposee: ['disponible', 'reçue'], analysee: ['surveiller', 'analysée'], transmise_ca: ['surveiller', 'transmise au CA'], retenue: ['reussi', 'retenue'], non_retenue: ['corriger', 'non retenue'], remplacee: ['neutre', 'remplacée'], retiree: ['neutre', 'retirée'] };

export default function MaCandidature() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [f, setF] = useState({ maintien: false, augmentation: '', renonce: false, temporaire: false, definitif: false, conditions: false, remarque: '' });
  const [lignes, setLignes] = useState([]);
  const [choix, setChoix] = useState({ section: '', cours: '', nature: 'temporaire', periodes: '' });
  const [retour, setRetour] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const charger = () => fetch('/api/candidatures/moi', { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
    .then(setD).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const sections = useMemo(() => [...new Set((d?.catalogue || []).map(c => c.section).filter(Boolean))].sort(), [d]);
  const cours = useMemo(() => (d?.catalogue || []).filter(c => !choix.section || c.section === choix.section), [d, choix.section]);
  if (erreur) return <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>;
  if (!d) return <p className="text-second text-slate-500">Chargement…</p>;
  if (!d.relie) return <Encadre etat="surveiller" titre="Compte non relié">Votre compte n’est relié à aucune fiche d’enseignant : le secrétariat fait le lien.</Encadre>;
  const c = d.campagne || {};
  const s = d.situation || {};
  const derniere = (d.miennes || []).find(x => x.annee_cible === c.annee_cible && !['remplacee', 'retiree'].includes(x.statut));
  const ouvrir = async id => {
    const r = await fetch(`/api/candidatures/${id}/document`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok) ouvrirApercu({ html: j.html, titre: j.titre, nomFichier: j.nom, envoiPossible: false });
  };
  const ajouter = () => {
    const x = (d.catalogue || []).find(k => k.cours_code === choix.cours); if (!x) return;
    setLignes(l => [...l, { nature: choix.nature, section: x.section, ue_num: x.ue_num, cours_code: x.cours_code, cours_nom: x.cours_nom, periodes: Number(choix.periodes) || x.periodes || null }]);
    setChoix(k => ({ ...k, cours: '', periodes: '' }));
  };
  const deposer = async () => {
    setEnvoi(true); setRetour(null);
    try {
      const r = await fetch('/api/candidatures/moi', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...f, augmentation: Number(f.augmentation) || null, lignes }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      setRetour({ ok: true, texte: `✓ ${j.accuse}` }); setLignes([]); charger();
    } catch (e) { setRetour({ ok: false, texte: e.message }); } finally { setEnvoi(false); }
  };
  const retirer = async x => {
    if (!(await demander({ titre: 'Retirer ma candidature', message: 'Elle sera retirée ; vous pourrez en déposer une autre tant que la campagne est ouverte.', confirmer: 'Retirer' }))) return;
    await fetch(`/api/candidatures/moi/${x.id}/retirer`, { method: 'POST', headers: authHeaders() }); charger();
  };
  const coche = (k, label, aide = null) => (
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!f[k]} onChange={e => setF(v => ({ ...v, [k]: e.target.checked, ...(k === 'renonce' && e.target.checked ? { maintien: false, temporaire: false, definitif: false, augmentation: '' } : {}) }))} />
      <span>{label}{aide && <span className="block text-mention text-slate-500">{aide}</span>}</span></label>);

  return (
    <div className="space-y-4">
      <h1 className="titre-ecran">Ma candidature</h1>
      {!c.ouverte ? <Encadre etat="neutre" titre="Pas de campagne ouverte">{c.annee_cible ? `La campagne de candidatures pour ${c.annee_cible} ${c.au && c.au < new Date().toISOString().slice(0, 10) ? `s’est terminée le ${fr(c.au)}` : `s’ouvrira le ${fr(c.du)}`}.` : 'La direction annonce la campagne de candidatures pour l’année suivante.'}</Encadre>
        : <Encadre etat="disponible" titre={`Candidatures pour ${c.annee_cible}`}>Jusqu’au {fr(c.au)}. Votre dépôt vaut accusé de réception ; la coordination et la direction l’analysent.</Encadre>}

      <section className="carte overflow-hidden">
        <EnteteCarte titre={`Ma situation en ${s.annee || ''}`} sous="Reprise de Lucie : vos attributions de l’année en cours." />
        <div className="px-4 py-3 text-sm flex flex-wrap gap-4">
          <span>Chargé de cours : <b>{s.cc || 0}</b> périodes</span><span>Expert : <b>{s.expert || 0}</b> périodes</span><span>Définitif : <b>{s.definitif || 0}</b> périodes</span>
        </div>
      </section>

      {c.ouverte && !(derniere && derniere.statut !== 'deposee') && (
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Ma demande" sous="Dans la mesure des postes disponibles." />
          <div className="px-4 py-3 space-y-2">
            {coche('maintien', `Le maintien de mes attributions pour ${c.annee_cible}`)}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.augmentation} onChange={e => setF(v => ({ ...v, augmentation: e.target.checked ? String(s.cc || '') : '', renonce: false }))} />
              Une augmentation de charge, à concurrence de <input className="controle !h-8 w-20" type="number" min="1" value={f.augmentation} onChange={e => setF(v => ({ ...v, augmentation: e.target.value, renonce: false }))} /> périodes au total</label>
            {coche('temporaire', 'Être engagé·e comme chargé·e de cours dans des cours', 'Choisissez-les ci-dessous (nature « temporaire »).')}
            {coche('definitif', 'Être engagé·e à titre définitif dans des unités', 'Après accord du CA, si les postes sont disponibles. Choisissez-les ci-dessous (nature « définitif »).')}
            {coche('renonce', 'Renoncer à ma charge de cours dans son intégralité')}
            {(f.temporaire || f.definitif) && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select className="controle !h-8" value={choix.nature} onChange={e => setChoix(k => ({ ...k, nature: e.target.value }))}>
                    {f.temporaire && <option value="temporaire">temporaire</option>}{f.definitif && <option value="definitif">définitif</option>}</select>
                  <select className="controle !h-8" value={choix.section} onChange={e => setChoix(k => ({ ...k, section: e.target.value, cours: '' }))}>
                    <option value="">Toutes les sections</option>{sections.map(x => <option key={x} value={x}>{x}</option>)}</select>
                  <select className="controle !h-8 max-w-[22rem]" value={choix.cours} onChange={e => setChoix(k => ({ ...k, cours: e.target.value }))}>
                    <option value="">Cours…</option>{cours.map(x => <option key={x.cours_code} value={x.cours_code}>UE {x.ue_num} · {x.cours_code} {x.cours_nom}</option>)}</select>
                  <input className="controle !h-8 w-24" type="number" min="1" placeholder="périodes" value={choix.periodes} onChange={e => setChoix(k => ({ ...k, periodes: e.target.value }))} />
                  <button type="button" className="bouton !h-8" disabled={!choix.cours} onClick={ajouter}>Ajouter</button>
                </div>
                {lignes.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 text-second">
                    <PastilleEtat etat={l.nature === 'definitif' ? 'surveiller' : 'disponible'}>{l.nature === 'definitif' ? 'définitif' : 'temporaire'}</PastilleEtat>
                    <span>{l.section} · UE {l.ue_num} · {l.cours_code} {l.cours_nom}{l.periodes ? ` · ${l.periodes} périodes` : ''}</span>
                    <button type="button" className="text-slate-400" aria-label="Retirer" onClick={() => setLignes(x => x.filter((_, j) => j !== i))}><IconTrash size={15} /></button>
                  </div>))}
              </div>)}
            <label className="block text-sm"><span className="text-slate-500">Remarque (facultatif)</span>
              <textarea className="controle w-full !h-auto py-2 mt-1" rows={2} value={f.remarque} onChange={e => setF(v => ({ ...v, remarque: e.target.value }))} data-reponses="candidature" /></label>
            {!f.renonce && coche('conditions', f.definitif ? 'Je confirme être dans les conditions légales pour candidater à une fonction de chargé de cours à titre définitif, et je tiens à disposition du secrétariat les documents légaux nécessaires.' : 'Je confirme être dans les conditions légales pour candidater à une fonction de chargé de cours à titre temporaire.')}
            <div className="flex justify-end"><button type="button" className="bouton bouton-fort" disabled={envoi} onClick={deposer}>{envoi ? 'Dépôt…' : derniere ? 'Remplacer ma candidature' : 'Déposer ma candidature'}</button></div>
            {retour && <Encadre etat={retour.ok ? 'reussi' : 'corriger'}>{retour.texte}</Encadre>}
          </div>
        </section>)}

      {(d.miennes || []).length > 0 && (
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Mes candidatures" />
          <div className="px-4 py-3 space-y-1.5">{d.miennes.map(x => { const [etat, mot] = ETAT[x.statut] || ['neutre', x.statut]; return (
            <div key={x.id} className="flex flex-wrap items-center gap-2 text-second">
              <PastilleEtat etat={etat}>{mot}</PastilleEtat>
              <span>{x.annee_cible} · déposée le {fr(x.depose_le)} à {String(x.depose_le || '').slice(11, 16)} (UTC){x.mot ? ` — « ${x.mot} »` : ''}</span>
              <button type="button" className="text-iip-blue inline-flex items-center gap-1" onClick={() => ouvrir(x.id)}><IconEye size={14} /> voir</button>
              {x.statut === 'deposee' && c.ouverte && <button type="button" className="text-iip-blue underline" onClick={() => retirer(x)}>retirer</button>}
            </div>); })}</div>
        </section>)}
    </div>);
}
