import { useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowUp, IconArrowDown, IconPrinter, IconRefresh } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { EnteteCarte } from './ui.jsx';

/* L'IIP ET LA HELB, UNE PAGE DE GESTION (3.5.431, Charles, 14 novembre 2026 : « que ce rapport soit comme une page dans Gestion, et que
   je puisse paramétrer ce que je veux comme diagrammes » ; tranché : les parties affichées, le type de graphique, ce qu'on mesure,
   l'ordre ; réglages gardés, l'impression les suit). Gestion → Dotation → IIP et HELB. À gauche les réglages, à droite LE DOCUMENT
   lui-même (POST /api/rapports/iip-helb-annees/document) : ce qu'on voit est ce qui s'imprime, un seul dessin — le serveur.
   Les réglages se gardent dans le navigateur (`lucie.iipHelb`) ; Éditions les reprend pour la même pièce. */

const MEMO = 'lucie.iipHelb';
const lire = () => { try { return JSON.parse(localStorage.getItem(MEMO) || '{}'); } catch { return {}; } };

export default function IipHelbGestion() {
  const memo = useMemo(lire, []);
  const [cat, setCat] = useState(null);
  const [sections, setSections] = useState([]);
  const [toutes, setToutes] = useState([]);
  const [section, setSection] = useState(memo.section || 'TIM');
  const [annees, setAnnees] = useState(memo.annees || null);
  const [reglages, setReglages] = useState(memo.reglages || {});
  const [doc, setDoc] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const cadre = useRef(null);

  useEffect(() => {
    fetch('/api/rapports/iip-helb/reglages', { headers: authHeaders() }).then(r => r.json()).then(setCat).catch(() => setCat({ parties: [], graphes: [], mesures: {} }));
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l =>
      setSections((Array.isArray(l) ? l : []).map(s => s.code || s).filter(Boolean))).catch(() => {});
    fetch('/api/annees', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(l => {
      const c = (Array.isArray(l) ? l : []).map(a => a.code || a).filter(Boolean).sort();
      setToutes(c); setAnnees(x => x || c.filter(a => a <= getAnnee()).slice(-4));
    }).catch(() => {});
  }, []);
  useEffect(() => { try { localStorage.setItem(MEMO, JSON.stringify({ section, annees, reglages })); } catch { /* sans mémoire */ } }, [section, annees, reglages]);

  // Le document, recomposé à chaque réglage (après une courte pause : un clic n'en déclenche qu'un).
  useEffect(() => {
    if (!annees?.length) { setDoc(null); return undefined; }
    let vivant = true;
    const t = setTimeout(async () => {
      setEnCours(true); setErreur(null);
      try {
        const r = await fetch('/api/rapports/iip-helb-annees/document', { method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ section, annees, reglages }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        if (vivant) setDoc(j);
      } catch (e) { if (vivant) setErreur(e.message); } finally { if (vivant) setEnCours(false); }
    }, 350);
    return () => { vivant = false; clearTimeout(t); };
  }, [section, annees, reglages]);

  // La hauteur de l'aperçu suit son contenu : pas de second ascenseur.
  const ajuster = () => { try { const d = cadre.current?.contentDocument; if (d) cadre.current.style.height = `${d.documentElement.scrollHeight + 20}px`; } catch { /* autre origine */ } };

  const parties = cat?.parties || [];
  const ordre = useMemo(() => {
    const cles = parties.map(p => p.cle);
    return [...(reglages.ordre || []).filter(k => cles.includes(k)), ...cles].filter((k, i, t) => t.indexOf(k) === i);
  }, [parties, reglages.ordre]);
  const masques = reglages.masques || [];
  const maj = (k, v) => setReglages(r => ({ ...r, [k]: v }));
  const bouger = (k, d) => { const o = [...ordre]; const i = o.indexOf(k), j = i + d; if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; maj('ordre', o); };
  const basculer = k => maj('masques', masques.includes(k) ? masques.filter(x => x !== k) : [...masques, k]);
  const mesure = (k) => reglages.mesures?.[k] || cat?.mesures?.[k]?.[0]?.[0];

  if (!cat) return <p className="text-second text-slate-400">Chargement…</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-[22rem_1fr] items-start">
      <div className="space-y-3 lg:sticky lg:top-3">
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Quoi" sous="La section et les années comparées" />
          <div className="p-3 space-y-2">
            <select className="controle w-full" value={section} onChange={e => setSection(e.target.value)} aria-label="Section">
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Années">
              {toutes.map(a => { const on = annees?.includes(a); return (
                <button key={a} type="button" aria-pressed={!!on} onClick={() => setAnnees(x => (on ? x.filter(y => y !== a) : [...(x || []), a]))}
                  className={`bouton !px-2 ${on ? '!bg-iip-blue !text-white' : ''}`}>{a.slice(2, 4)}-{a.slice(7, 9)}</button>); })}
            </div>
          </div>
        </section>
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Ce qu’on mesure" />
          <div className="p-3 space-y-2">
            {Object.entries(cat.mesures || {}).map(([k, opts]) => (
              <div key={k} className="segments w-full" role="radiogroup">
                {opts.map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={mesure(k) === v} onClick={() => maj('mesures', { ...(reglages.mesures || {}), [k]: v })}
                    className={`flex-1 ${mesure(k) === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{l}</button>))}
              </div>))}
          </div>
        </section>
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Les parties" sous="Cocher, ranger, choisir le graphique" />
          <ul className="divide-y divide-slate-100">
            {ordre.map((k, i) => { const p = parties.find(x => x.cle === k); if (!p) return null; const vu = !masques.includes(k); return (
              <li key={k} className={`px-3 py-1.5 flex items-center gap-2 ${vu ? '' : 'opacity-50'}`}>
                <input type="checkbox" checked={vu} onChange={() => basculer(k)} aria-label={`Afficher ${p.titre}`} />
                <span className="text-second flex-1 min-w-0 truncate" title={p.titre}>{p.titre}</span>
                {p.graphe && (
                  <select className="text-mention border border-slate-200 rounded px-1 py-0.5 max-w-[8.5rem]" value={reglages.graphes?.[k] || p.graphe}
                    onChange={e => maj('graphes', { ...(reglages.graphes || {}), [k]: e.target.value })} aria-label={`Graphique de ${p.titre}`}>
                    {cat.graphes.map(([g, l]) => <option key={g} value={g}>{l}</option>)}
                  </select>)}
                <button type="button" className="text-slate-400 hover:text-iip-blue disabled:opacity-30" disabled={i === 0} onClick={() => bouger(k, -1)} aria-label="Monter"><IconArrowUp size={14} /></button>
                <button type="button" className="text-slate-400 hover:text-iip-blue disabled:opacity-30" disabled={i === ordre.length - 1} onClick={() => bouger(k, 1)} aria-label="Descendre"><IconArrowDown size={14} /></button>
              </li>); })}
          </ul>
          <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-2 text-second">
            <label className="flex items-center gap-1.5 flex-1"><input type="checkbox" checked={reglages.saut !== false} onChange={e => maj('saut', e.target.checked)} /> Une partie par page</label>
            <button type="button" className="bouton !px-2 inline-flex items-center gap-1" onClick={() => setReglages({})} title="Revenir aux réglages d’origine"><IconRefresh size={14} />Origine</button>
          </div>
        </section>
      </div>

      <section className="carte overflow-hidden min-w-0">
        <EnteteCarte titre={`IIP et HELB — ${section}`} sous={enCours ? 'Composition…' : (annees || []).join(' · ')}>
          <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={!doc?.html}
            onClick={() => ouvrirApercu({ html: doc.html, titre: doc.titre, sousTitre: (annees || []).join(' · '), nomFichier: doc.nom })}>
            <IconPrinter size={15} />Imprimer ou envoyer</button>
        </EnteteCarte>
        {erreur && <div className="bloc-etat m-3 px-3 py-2 text-second" data-etat="corriger">{erreur}</div>}
        {!annees?.length ? <p className="p-4 text-second text-slate-500">Cochez au moins une année.</p>
          : doc?.html ? <iframe ref={cadre} title="Aperçu" srcDoc={doc.html} onLoad={ajuster} className="w-full border-0 bg-white" style={{ minHeight: '70vh' }} />
          : <p className="p-4 text-second text-slate-400">Composition…</p>}
      </section>
    </div>);
}
