import { useEffect, useMemo, useRef, useState } from 'react';
import { authHeaders, api } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Encadre, EnteteCarte, PastilleEtat } from './ui.jsx';

/* EXAMENS : PRÉPARER ET IMPRIMER (3.5.226 ; refait en trois zones en 3.5.730, Charles, 26 novembre 2026 : « au lieu des boutons, il
   faudrait revoir cet écran ; ce n'est pas clair et c'est lourd » ; maquette validée). Comme Éditions :
     1 · les épreuves de la période, JOUR PAR JOUR, chacune avec ce qui lui manque (questionnaire, surveillant, local) et ses AR ;
     2 · PRÉPARER l'épreuve choisie (surveillants, type, durée, matériel, questionnaire reçu, besoins des AR) ;
     3 · SORTIR : les pièces en cases à cocher, rangées par usage, et UN bouton « Produire ».
   Les pièces et la procédure ne changent pas : serveur /api/examens (lib/examens.js). Depuis le calendrier des sessions, `initial`
   règle section, session, jour et épreuve. `integre` retire le titre d'écran (centre d'impression). */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const jourLong = d => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '');
const aujourdhui = () => new Date().toLocaleDateString('sv-SE');
const duree = m => `${Math.floor(m / 60)} h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;

// Les pièces, rangées par USAGE (les identifiants sont ceux du serveur ; une pièce inconnue tombe dans « Autres »).
const FAMILLES = [
  { k: 'enveloppe', titre: 'Pour l’enveloppe', ids: ['enveloppe', 'fiche', 'registre', 'plan', 'ar', 'incident', 'brouillon', 'archivage'] },
  { k: 'secretariat', titre: 'Pour le secrétariat', ids: ['besoins', 'recap'] },
  { k: 'etudiants', titre: 'Pour les étudiants', ids: ['valves', 'garde'] },
];

function manques(e) {
  const l = [];
  if (e.session === 1 && !e.questionnaire_recu_le) l.push({ t: 'questionnaire', etat: e.delai_questionnaire && e.delai_questionnaire < aujourdhui() ? 'corriger' : 'surveiller' });
  if (!e.surveillants) l.push({ t: 'surveillant', etat: 'surveiller' });
  if (!e.local) l.push({ t: 'local', etat: 'surveiller' });
  return l;
}

function Champ({ valeur, onPoser, liste, placeholder = '' }) {
  const [v, setV] = useState(valeur || '');
  useEffect(() => setV(valeur || ''), [valeur]);
  return <input className="controle w-full" value={v} list={liste} placeholder={placeholder} data-reponses="non"
    onChange={e => setV(e.target.value)} onBlur={() => { if ((v || '') !== (valeur || '')) onPoser(v); }} />;
}

export default function ExamensPreparer({ annee, initial = null, integre = false }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(initial?.section || '');
  const [session, setSession] = useState(Number(initial?.session) === 2 ? 2 : 1);
  const [du, setDu] = useState(initial?.du || '');
  const [au, setAu] = useState(initial?.au || '');
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [coches, setCoches] = useState(new Set());
  const [choisie, setChoisie] = useState(null);       // la clé de l'épreuve préparée à droite
  const [pieces, setPieces] = useState(new Set(['enveloppe']));
  const [detail, setDetail] = useState(false);        // « ou une pièce… » : déplier les pièces de l'enveloppe
  const [enCours, setEnCours] = useState(false);
  const premiereCle = useRef(initial?.cle || null);

  useEffect(() => { api.sections().then(l => setSections(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  const charger = () => {
    const q = new URLSearchParams({ annee: annee || '', session: String(session), ...(section ? { section } : {}), ...(du ? { du } : {}), ...(au ? { au } : {}) });
    fetch(`/api/examens?${q}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
      .then(j => {
        setD(j); setErreur(null);
        const l = j.epreuves || [];
        const voulue = premiereCle.current; premiereCle.current = null;
        const ok = voulue && l.some(e => e.cle === voulue);
        setCoches(new Set(ok ? [voulue] : l.map(e => e.cle)));     // par défaut : toutes les épreuves de la période
        setChoisie(ok ? voulue : (l.find(e => manques(e).length) || l[0])?.cle || null);
      })
      .catch(e => setErreur(e.message));
  };
  useEffect(() => { charger(); }, [annee, section, session, du, au]);   // eslint-disable-line react-hooks/exhaustive-deps

  const liste = d?.epreuves || [];
  const jours = useMemo(() => {
    const m = new Map();
    for (const e of liste) { const k = String(e.date).slice(0, 10); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
    return [...m.entries()];
  }, [liste]);
  const e = liste.find(x => x.cle === choisie) || null;
  const tous = liste.length > 0 && liste.every(x => coches.has(x.cle));
  const basculer = k => setCoches(c => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const aPreparer = liste.filter(x => manques(x).length).length;
  const catalogue = d?.pieces || [];
  const libelle = id => catalogue.find(p => p.id === id)?.libelle || id;
  const familles = FAMILLES.map(f => ({ ...f, ids: f.ids.filter(id => catalogue.some(p => p.id === id)) }));
  const autres = catalogue.filter(p => !FAMILLES.some(f => f.ids.includes(p.id))).map(p => p.id);
  if (autres.length) familles.push({ k: 'autres', titre: 'Autres', ids: autres });
  const basculerPiece = id => setPieces(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    // L'enveloppe complète contient déjà ses pièces : on ne coche pas les deux.
    if (id === 'enveloppe' && n.has('enveloppe')) familles[0].ids.filter(x => x !== 'enveloppe').forEach(x => n.delete(x));
    if (id !== 'enveloppe' && familles[0].ids.includes(id) && n.has(id)) n.delete('enveloppe');
    return n;
  });

  const poser = async (x, champ, valeur) => {
    const r = await fetch('/api/examens/detail', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ annee: d.annee, session, ue_num: x.ue_num, cours_code: x.cours_code, [champ]: valeur }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Enregistrement refusé.'); return; }
    setD(y => ({ ...y, epreuves: y.epreuves.map(z => (z.cle === x.cle ? { ...z, ...j.detail, heure_fin: finDe(z.heure, j.detail.duree_min) } : z)) }));
  };
  const produire = async () => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/examens/documents', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee: d.annee, session, section: section || null, du: du || null, au: au || null, cles: [...coches], pieces: [...pieces] }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Les pièces n’ont pas pu être composées.');
      ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: j.sous, nomFichier: j.nom, envoiPossible: false, astuceImpression: 'A4 portrait' });
    } catch (x) { setErreur(x.message); } finally { setEnCours(false); }
  };

  return (
    <div className="space-y-3">
      {!integre && <h1 className="titre-ecran">Examens : préparer et imprimer</h1>}
      {/* 1 · LA PÉRIODE */}
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
        <select className="controle" value={section} onChange={x => setSection(x.target.value)}>
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <div className="segments flex">{[1, 2].map(n => <button key={n} type="button" onClick={() => setSession(n)} className={session === n ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{n === 1 ? '1re session' : '2e session'}</button>)}</div>
        <label className="text-second text-slate-500 inline-flex items-center gap-1">Du <input type="date" className="controle" value={du} onChange={x => setDu(x.target.value)} /></label>
        <label className="text-second text-slate-500 inline-flex items-center gap-1">au <input type="date" className="controle" value={au} onChange={x => setAu(x.target.value)} /></label>
      </div>
      {erreur && <Encadre etat="corriger" titre="Refusé">{erreur}</Encadre>}
      <datalist id="examens-personnes">{(d?.personnes || []).map(p => <option key={p} value={p} />)}</datalist>

      {!d && !erreur ? <p className="text-second text-slate-500">Chargement…</p>
        : !liste.length ? <Encadre etat="neutre" titre="Aucune épreuve datée">Les épreuves se datent dans Organisation → Sessions : épreuves et délibérations (date, heure, local).</Encadre>
        : <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
            {/* LES ÉPREUVES, JOUR PAR JOUR */}
            <section className="carte overflow-hidden">
              <div className="entete-carte flex items-center gap-2 px-4 py-2 text-second">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={tous} onChange={() => setCoches(tous ? new Set() : new Set(liste.map(x => x.cle)))} />
                  {liste.length} épreuve{liste.length > 1 ? 's' : ''} · {jours.length} jour{jours.length > 1 ? 's' : ''}</label>
                <span className="ml-auto text-slate-500">{aPreparer ? `à préparer : ${aPreparer}` : 'toutes prêtes'}</span>
              </div>
              {jours.map(([jour, l]) => (
                <div key={jour}>
                  <div className="tab-repere px-4 py-1 text-second text-slate-500 capitalize">{jourLong(jour)}</div>
                  {l.map(x => {
                    const m = manques(x);
                    const active = x.cle === choisie;
                    return (
                      <div key={x.cle} role="button" tabIndex={0} onClick={() => setChoisie(x.cle)} onKeyDown={k => { if (k.key === 'Enter') setChoisie(x.cle); }}
                        className={`flex items-center gap-3 px-4 py-2 border-b border-slate-100 cursor-pointer ${active ? 'ligne-active' : 'hover:bg-slate-50'}`}
                        style={active ? { boxShadow: 'inset 3px 0 0 var(--c-principal)' } : undefined}>
                        <input type="checkbox" checked={coches.has(x.cle)} onClick={k => k.stopPropagation()} onChange={() => basculer(x.cle)} aria-label={`UE ${x.ue_num} ${x.cours_code}`} />
                        <span className="tabular-nums text-sm w-11">{String(x.heure || '').slice(0, 5)}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate text-sm"><b>UE {x.ue_num}</b> · {x.cours_code ? `${x.cours_code} ${x.cours_nom || ''}` : `unité entière`}</span>
                          <span className="block truncate text-second text-slate-500">{x.local || 'local à poser'} · {x.etudiants} étudiant{x.etudiants > 1 ? 's' : ''}{x.section && !section ? ` · ${x.section}` : ''}</span>
                        </span>
                        <span className="flex flex-wrap justify-end gap-1">
                          {m.map(y => <PastilleEtat key={y.t} etat={y.etat}>{y.t}</PastilleEtat>)}
                          {!m.length && <PastilleEtat etat="reussi">prête</PastilleEtat>}
                          {x.ar > 0 && <PastilleEtat etat="neutre">AR {x.ar}</PastilleEtat>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>

            {/* 2 · PRÉPARER L'ÉPREUVE CHOISIE */}
            <section className="carte overflow-hidden lg:sticky lg:top-2">
              <EnteteCarte titre="Préparer" sous={e ? 'Ce que le calendrier ne porte pas.' : 'Choisissez une épreuve à gauche.'} />
              {e && <div className="px-4 py-3 space-y-3 text-sm">
                <div>
                  <div className="font-semibold">UE {e.ue_num} · {e.cours_code ? `${e.cours_code} ${e.cours_nom || ''}` : (e.ue_nom || 'unité entière')}</div>
                  <div className="text-second text-slate-500">{jourLong(e.date)} · {String(e.heure || '').slice(0, 5)} → {e.heure_fin} · {e.local || 'local à poser'}{e.professeurs ? ` · ${e.professeurs}` : ''}</div>
                </div>
                <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 items-center">
                  <span className="text-slate-500">Surveillants</span><Champ valeur={e.surveillants} liste="examens-personnes" placeholder="Nom(s)…" onPoser={v => poser(e, 'surveillants', v)} />
                  <span className="text-slate-500">Type et durée</span>
                  <span className="flex gap-2">
                    <select className="controle" value={e.type} onChange={x => poser(e, 'type', x.target.value)}><option value="ecrit">écrit</option><option value="oral">oral</option></select>
                    <select className="controle" value={e.duree_min} onChange={x => poser(e, 'duree_min', Number(x.target.value))}>
                      {[...new Set([60, 90, 120, 150, 180, 240, e.duree_min])].sort((a, b) => a - b).map(m => <option key={m} value={m}>{duree(m)}</option>)}</select>
                  </span>
                  <span className="text-slate-500">Matériel</span><Champ valeur={e.materiel} placeholder="par défaut (procédure)" onPoser={v => poser(e, 'materiel', v)} />
                  <span className="text-slate-500">Questionnaire</span>
                  {e.session === 2 ? <span className="text-second text-slate-400">reçu avec la 1re session</span> : (
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={!!e.questionnaire_recu_le} onChange={x => poser(e, 'questionnaire_recu_le', x.target.checked ? aujourdhui() : null)} />
                      {e.questionnaire_recu_le ? `reçu le ${fr(e.questionnaire_recu_le)}`
                        : <span style={e.delai_questionnaire && e.delai_questionnaire < aujourdhui() ? { color: 'var(--c-refuse)', fontWeight: 600 } : undefined} className="text-slate-500">attendu pour le {fr(e.delai_questionnaire)}</span>}
                    </label>)}
                </div>
                <div className="bloc-etat px-3 py-2 text-second" data-etat={e.ar ? 'neutre' : 'neutre'}>
                  {e.ar ? <><b>{e.ar} étudiant{e.ar > 1 ? 's' : ''} avec un aménagement</b>{(e.besoins || []).length ? ' : ' + e.besoins.map(b => `${b.t} ×${b.n}`).join(' · ') : ''}</>
                    : 'Aucun aménagement raisonnable pour cette épreuve.'}
                </div>
              </div>}
            </section>
          </div>

          {/* 3 · SORTIR */}
          <section className="carte overflow-hidden">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-4 py-3 text-sm">
              {familles.map(f => (
                <div key={f.k} className="space-y-1">
                  <div className="text-second text-slate-500">{f.titre}</div>
                  {f.ids.filter(id => f.k !== 'enveloppe' || id === 'enveloppe' || detail).map(id => (
                    <label key={id} className="flex items-center gap-2" title={catalogue.find(p => p.id === id)?.aide || ''}>
                      <input type="checkbox" checked={pieces.has(id)} onChange={() => basculerPiece(id)} /> {libelle(id)}
                    </label>
                  ))}
                  {f.k === 'enveloppe' && <button type="button" className="text-second text-iip-blue underline" onClick={() => setDetail(v => !v)}>
                    {detail ? 'masquer les pièces une à une' : 'ou une pièce de l’enveloppe…'}</button>}
                </div>
              ))}
              <span className="flex-1" />
              <div className="flex flex-col items-end gap-1">
                <button type="button" className="bouton bouton-fort" disabled={!pieces.size || !coches.size || enCours} onClick={produire}>
                  {enCours ? 'Composition…' : `Produire (${coches.size} épreuve${coches.size > 1 ? 's' : ''})`}</button>
                <span className="text-mention text-slate-500">{!coches.size ? 'Cochez au moins une épreuve.' : !pieces.size ? 'Cochez au moins une pièce.' : `${pieces.size} pièce${pieces.size > 1 ? 's' : ''}`}</span>
              </div>
            </div>
          </section>
        </>}
    </div>);
}

function finDe(h, m) {
  const [a, b] = String(h || '').slice(0, 5).split(':').map(Number);
  if (!Number.isFinite(a)) return '';
  const t = a * 60 + (b || 0) + Number(m || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
