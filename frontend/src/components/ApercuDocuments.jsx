import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconFileText, IconAlertTriangle, IconExternalLink, IconSearch, IconArrowRight } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import ChoixUnite from './ChoixUnite.jsx';
import ChampEtudiant from './ChampEtudiant.jsx';
import { ouvrirApercu } from '../lib/apercu.js';
import { Fenetre } from './ui.jsx';
import EditeurModelePiece from './EditeurModelePiece.jsx';
import { useDroits } from '../lib/droits.js';
import { IconPencil } from '@tabler/icons-react';

/**
 * LA GALERIE DES PIÈCES — un exemple de CHAQUE document que Lucie sait sortir
 * (Charles, 7 octobre 2026 : « TOUS. Avec choix UE, étudiant, etc. »).
 *
 * Le catalogue vient du serveur (lib/galerieDocuments.js) : chaque pièce dit
 * quelle route la produit et ce qu'il faut choisir. On la rend AVEC LA ROUTE
 * QUI LA PRODUIT — ce qu'on voit est ce qui sortira. Chaque pièce s'ouvre sur
 * un exemple tiré de la base ; les choix de la barre le remplacent. Rien de ce
 * qui est montré ici ne s'enregistre ni ne s'archive.
 */
const moisPrecedent = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); };
const LIB_CHOIX = { professeur: 'Membre du personnel', cours: 'Cours', amenagement: 'Dossier d’aménagement', procedure: 'Dossier de procédure',
  reunion: 'Réunion', offre: 'Offre', ea12: 'EA12', template: 'Modèle', lieu: 'Lieu de stage' };

function remplacer(v, val) {
  if (Array.isArray(v)) return v.map(x => remplacer(x, val)).filter(x => x !== undefined);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { const y = remplacer(x, val); if (y !== undefined && y !== '') o[k] = y; }
    return o;
  }
  if (typeof v === 'string') {
    const m = v.match(/^\{(\w+)\}$/);
    if (m) { const x = val[m[1]]; return x === undefined || x === null || x === '' ? undefined : x; }
    return v.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(val[k] ?? ''));
  }
  return v;
}

export default function ApercuDocuments({ onClose }) {
  const navigate = useNavigate();
  const [annee, setAnnee] = useState(getAnnee());
  const [g, setG] = useState(null);
  const [choisi, setChoisi] = useState(null);
  const [val, setVal] = useState({});
  const [nomEtu, setNomEtu] = useState('');
  const [rendu, setRendu] = useState(null);        // { html } | { pdf } | { erreur, manques }
  const [enCours, setEnCours] = useState(false);
  const [filtre, setFiltre] = useState('');
  const urlPdf = useRef(null);
  // L'ÉDITEUR DU MODÈLE (9 octobre 2026) : il prend la place de la liste, et
  // l'aperçu de droite se recompose avec son brouillon.
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(null);
  const droits = useDroits();

  useEffect(() => {
    fetch(`/api/apercu/galerie?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => { if (j.error) throw new Error(j.error); setG(j); })
      .catch(e => setRendu({ erreur: e.message }));
  }, [annee]);

  // Une pièce choisie s'ouvre sur SON exemple ; le reste garde ce qu'on a choisi.
  const choisir = d => {
    setChoisi(d);
    const ex = (d.exemple && g?.exemples?.[d.exemple]) || {};
    // L'année et la session viennent de l'exemple de la pièce, sinon de l'année de travail :
    // jamais de l'exemple de la pièce précédente.
    const { annee: _a, session: _s, debut: _d, fin: _f, ...garde } = val;
    const v = { session: 1, niveau: 'superieur', mois: moisPrecedent(), ...garde, annee, ...ex };
    if (ex.etudiant && typeof ex.etudiant === 'object') { v.etudiant = ex.etudiant.id; setNomEtu(`${String(ex.etudiant.nom || '').toUpperCase()} ${ex.etudiant.prenom || ''}`); }
    for (const k of Object.keys(LIB_CHOIX)) if (!v[k] && g?.choix?.[k]?.[0]) v[k] = g.choix[k][0].v;
    if (!v.section && g?.choix?.sections?.[0]) v.section = ex.section || g.choix.sections[0];
    const an = String(v.annee || annee);
    if (!v.debut) v.debut = `${an.slice(0, 4)}-09-15`;
    if (!v.fin) v.fin = `${an.slice(5, 9)}-06-30`;
    setVal(v);
  };
  useEffect(() => { if (g && !choisi && g.documents[0]) choisir(g.documents[0]); }, [g]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!choisi) return;
    const valeurs = val;
    let vivant = true;
    (async () => {
      setEnCours(true);
      try {
        const a = choisi.appel;
        const val = { ...valeurs, mois_num: valeurs.mois ? Number(String(valeurs.mois).slice(5)) : '' };
        const q = a.query ? new URLSearchParams(remplacer(a.query, val)) : null;
        const url = remplacer(a.chemin, val) + (q && [...q].length ? `?${q}` : '');
        const rep = await fetch(url, { method: a.methode, headers: authHeaders({ 'X-Annee': val.annee || annee, ...(edition && brouillon ? { 'X-Modele-Brouillon': brouillon } : {}) }),
          ...(a.methode === 'POST' ? { body: JSON.stringify(remplacer(a.corps || {}, val)) } : {}) });
        const type = rep.headers.get('content-type') || '';
        if (!rep.ok || type.includes('application/json')) {
          const j = await rep.json().catch(() => ({}));
          if (!rep.ok) { if (vivant) setRendu({ erreur: j.detail || j.error || `Erreur ${rep.status}`, manques: j.manques }); return; }
          const html = j[choisi.champ || 'html'] || j.html || j.html_pv || j.documents?.[0]?.html || j.collectif?.html;
          if (vivant) setRendu(html ? { html, nom: j.nom, manques: j.manques } : { erreur: 'La pièce est vide pour ce choix : rien à montrer.', manques: j.manques });
          return;
        }
        if (type.includes('pdf')) {
          if (urlPdf.current) URL.revokeObjectURL(urlPdf.current);
          urlPdf.current = URL.createObjectURL(await rep.blob());
          if (vivant) setRendu({ pdf: urlPdf.current });
          return;
        }
        const html = await rep.text();
        if (vivant) setRendu({ html });
      } catch (e) { if (vivant) setRendu({ erreur: e.message }); }
      finally { if (vivant) setEnCours(false); }
    })();
    return () => { vivant = false; };
  }, [choisi, val, brouillon]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* LA GALERIE MONTRE LA FEUILLE (9 octobre 2026) : comme l'aperçu commun,
     une pièce qui porte le pied de Lucie se compose en PDF — le HTML n'a pas
     de pages, et son pied tombait sous la dernière ligne. Pendant qu'on
     modifie un modèle, le HTML reste : il suit la frappe sans attendre. */
  const [feuille, setFeuille] = useState(null);
  useEffect(() => {
    setFeuille(null);
    const h = rendu?.html;
    if (!h || edition || !/class="pied-lucie"/.test(h)) return undefined;
    let vivant = true; let url = null;
    fetch('/api/impression/pdf', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ html: h, nom: rendu.nom || choisi?.libelle || 'piece',
        orientation: /size:\s*A4\s+landscape/.test(h) ? 'paysage' : 'portrait' }) })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => { if (vivant && b) { url = URL.createObjectURL(b); setFeuille(url); } })
      .catch(() => {});
    return () => { vivant = false; if (url) URL.revokeObjectURL(url); };
  }, [rendu, edition]);   // eslint-disable-line react-hooks/exhaustive-deps

  const groupes = useMemo(() => {
    const m = new Map();
    const f = filtre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const d of g?.documents || []) {
      if (f && !`${d.libelle} ${d.domaine}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(f)) continue;
      if (!m.has(d.domaine)) m.set(d.domaine, []);
      m.get(d.domaine).push(d);
    }
    return [...m];
  }, [g, filtre]);

  const pose = (k, v) => setVal(o => ({ ...o, [k]: v }));
  const P = choisi?.params || [];

  return (
    <Fenetre icone={IconFileText} titre="Galerie des pièces" large="pleine" onFermer={onClose}
      sous={`${g?.documents?.length || '…'} pièces, chacune sur un exemple de la base — choisissez l’étudiant, l’unité, la section… Rien ne s’enregistre.`}
      pied={<><span className="text-[12px] text-slate-500">L’aperçu passe par la route qui produit la pièce : ce que vous voyez est ce qui sortira.</span>
        <button onClick={onClose} className="bouton">Fermer</button></>}>
      <div className="flex -mx-5 -my-4 h-[calc(88vh-8rem)]">
        {edition && choisi?.modeles?.length ? (
        <div className="w-[min(52%,760px)] border-r border-slate-200 flex flex-col min-h-0">
          <EditeurModelePiece key={choisi.id} cles={choisi.modeles} onBrouillon={setBrouillon}
            onFermer={() => { setEdition(false); setBrouillon(null); }} />
        </div>
        ) : (
        <div className="w-[320px] border-r border-slate-200 flex flex-col">
          <div className="p-2 border-b border-slate-200 relative">
            <IconSearch size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={filtre} onChange={e => setFiltre(e.target.value)} placeholder="Chercher une pièce…" data-reponses="non"
              className="controle controle-icone w-full" />
          </div>
          <div className="flex-1 overflow-auto p-2">
            {groupes.map(([dom, docs]) => (
              <div key={dom} className="mb-2">
                <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-500">{dom} · {docs.length}</div>
                {docs.map(d => (
                  <button key={d.id} onClick={() => choisir(d)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-champ border text-[13px] ${choisi?.id === d.id ? 'border-iip-blue bg-white' : 'border-transparent hover:bg-slate-50'}`}>
                    {d.libelle}
                  </button>))}
              </div>))}
            {!!g?.a_l_ecran?.length && !filtre && (
              <div className="mb-2">
                <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-500">Composées à l’écran · {g.a_l_ecran.length}</div>
                <p className="px-2 pb-1 text-[11px] text-slate-500">Elles se dessinent dans le navigateur, sur l’écran qui les produit — l’aperçu s’y ouvre avant d’imprimer.</p>
                {g.a_l_ecran.map(d => (
                  <button key={d.libelle} onClick={() => { onClose(); navigate(d.ecran); }}
                    className="w-full text-left px-2.5 py-1.5 rounded-champ text-[13px] hover:bg-slate-50 flex items-center gap-1.5">
                    <span className="flex-1">{d.libelle} <span className="text-[11px] text-slate-400">({d.domaine})</span></span>
                    <IconArrowRight size={13} className="text-slate-400" />
                  </button>))}
              </div>)}
          </div>
        </div>

        )}

        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
            {P.includes('annee') && (
              <select value={val.annee || annee} onChange={e => { pose('annee', e.target.value); if (!choisi?.exemple) setAnnee(e.target.value); }}
                className="controle" title="Année académique">
                {[...new Set([val.annee, annee, ...(g?.choix?.annees || [])].filter(Boolean))].map(a => <option key={a}>{a}</option>)}
              </select>)}
            {P.includes('section') && (
              <select value={val.section || ''} onChange={e => pose('section', e.target.value)} className="controle" title="Section">
                {(g?.choix?.sections || []).map(s => <option key={s}>{s}</option>)}
              </select>)}
            {P.includes('etudiant') && (
              <ChampEtudiant valeur={nomEtu} className="w-[17rem]"
                onChoisir={e => { setNomEtu(`${String(e.nom || '').toUpperCase()} ${e.prenom || ''}`); pose('etudiant', e.id); }} />)}
            {P.includes('ue') && (
              <ChoixUnite value={val.ue ?? ''} annee={val.annee || annee} onChange={v => pose('ue', v == null ? '' : Number(v))} className="max-w-[20rem]" />)}
            {P.includes('session') && (
              <select value={val.session || 1} onChange={e => pose('session', Number(e.target.value))} className="controle">
                <option value={1}>1re session</option><option value={2}>2e session</option>
              </select>)}
            {P.includes('niveau') && (
              <select value={val.niveau} onChange={e => pose('niveau', e.target.value)} className="controle">
                <option value="superieur">Supérieur</option><option value="secondaire">Secondaire</option>
              </select>)}
            {P.includes('mois') && (
              <input type="month" value={val.mois || ''} onChange={e => pose('mois', e.target.value)} className="controle" />)}
            {P.filter(k => LIB_CHOIX[k]).map(k => (
              <select key={k} value={val[k] ?? ''} onChange={e => pose(k, e.target.value)} className="controle max-w-[22rem]" title={LIB_CHOIX[k]}>
                {!(g?.choix?.[k] || []).length && <option value="">— aucun {LIB_CHOIX[k].toLowerCase()} en base —</option>}
                {(g?.choix?.[k] || []).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>))}
            <span className="flex-1" />
            {!edition && !!choisi?.modeles?.length && droits.peut('documentation.modeles') && (
              <button className="bouton controle inline-flex items-center gap-1" onClick={() => setEdition(true)}>
                <IconPencil size={14} /> Modifier le modèle
              </button>)}
            {rendu?.html && (
              <button className="bouton controle inline-flex items-center gap-1"
                onClick={() => ouvrirApercu({ html: rendu.html, titre: choisi?.libelle, nomFichier: rendu.nom, envoiPossible: false })}>
                <IconExternalLink size={14} /> Ouvrir dans l’aperçu
              </button>)}
            {rendu?.pdf && (
              <a href={rendu.pdf} target="_blank" rel="noreferrer" className="bouton controle inline-flex items-center gap-1">
                <IconExternalLink size={14} /> Ouvrir le PDF
              </a>)}
          </div>
          {choisi?.note && <div className="px-3 py-1.5 text-[12px] text-slate-500 border-b border-slate-200">{choisi.note}</div>}
          {rendu?.erreur && (
            <div className="m-3 px-3 py-2 rounded-champ border-l-4 border-amber-600 bg-white text-[13px] flex items-start gap-2">
              <IconAlertTriangle size={15} className="flex-none mt-0.5 text-amber-700" />
              <div>{rendu.erreur}
                {!!rendu.manques?.length && <ul className="list-disc ml-5 mt-1 text-[12px] text-slate-600">
                  {rendu.manques.slice(0, 8).map((m, i) => <li key={i}>{typeof m === 'string' ? m : (m.manques || []).join(' ; ') || JSON.stringify(m)}</li>)}</ul>}
              </div>
            </div>)}
          <div className="flex-1 min-h-0 bg-slate-100 relative">
            {enCours && <div className="absolute top-2 right-3 text-[12px] text-slate-500">Rendu en cours…</div>}
            {rendu?.html && feuille && <iframe aria-label="Aperçu PDF de la pièce" src={feuille} className="w-full h-full border-0" />}
            {rendu?.html && <iframe aria-label="Aperçu" srcDoc={rendu.html} className={`w-full h-full border-0 ${feuille ? 'hidden' : ''}`} />}
            {rendu?.pdf && <iframe aria-label="Aperçu PDF" src={rendu.pdf} className="w-full h-full border-0" />}
          </div>
        </div>
      </div>
    </Fenetre>
  );
}
