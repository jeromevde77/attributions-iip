import { useEffect, useMemo, useState } from 'react';
import { IconWriting, IconChartBar, IconChartHistogram, IconUsers, IconFileTypePdf, IconFileSpreadsheet, IconFileText, IconAlertTriangle, IconEye, IconCheck } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { EnteteCarte, ListeEtats, LigneEtat, Encadre } from './ui.jsx';

/**
 * ÉDITIONS (3.5.340 ; 3.5.344 : la pièce d'abord, puis un, plusieurs ou tous ses cours — « on choisit ce qu'on veut et après on
 * filtre »). MES ÉDITIONS (3.5.340, Charles, 11 novembre 2026 : « un centre Éditions pour les profs : listes d'étudiants, résultats de leurs
 * cours, étudiants en seconde session, dispensés, présences, statistiques… »). L'enseignant choisit UN de ses cours, puis une
 * pièce : « Aperçu » l'ouvre dans l'aperçu commun ; « PDF » et « Excel » la téléchargent. Le catalogue et les pièces
 * viennent du serveur (`GET /api/mes-cours/editions/catalogue`, `GET /api/mes-cours/editions/:piece?cours=`), sous la règle
 * d'accès de Mes cours. Monté dans Mes cours (fenêtre) et dans l'espace enseignant (face « Mes éditions »), où les téléchargements
 * passent par le relais.
 */
const ICONES = { examens: IconWriting, resultats: IconChartBar, statistiques: IconChartHistogram, etudiants: IconUsers };

async function telecharger(url, nomParDefaut) {
  const r = await fetch(url, { headers: authHeaders() });
  const type = r.headers.get('Content-Type') || '';
  if (!r.ok || type.includes('application/json')) {
    const j = await r.json().catch(() => ({}));
    throw Object.assign(new Error(j.error || 'La pièce n’a pas pu être produite.'), { html: j.html, nom: j.nom });
  }
  const blob = await r.blob();
  const m = /filename="?([^";]+)"?/i.exec(r.headers.get('Content-Disposition') || '');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = m ? decodeURIComponent(m[1]) : nomParDefaut;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

const ZONE = { background: 'color-mix(in srgb, var(--c-principal) 4%, var(--c-fenetre_corps, #fff))' };
function Etape({ n, titre, fait, attend, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-iip-blue">
      <span className={`w-[22px] h-[22px] rounded-full inline-grid place-items-center text-xs font-bold flex-none ${
        attend ? 'text-slate-400 ring-[1.5px] ring-inset ring-slate-300' : 'text-white'}`}
        style={attend ? undefined : { background: fait ? 'var(--c-reussi)' : 'var(--c-principal)' }}>
        {fait ? <IconCheck size={13} stroke={3} /> : n}</span>
      {titre}{children}
    </div>);
}

export default function MesEditions({ annee: anneeProp = null }) {
  const annee = anneeProp || getAnnee();
  const [cours, setCours] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [piece, setPiece] = useState(null);           // id de la pièce choisie
  const [coches, setCoches] = useState(new Set());    // codes des cours
  const [session, setSession] = useState(1);
  const [enCours, setEnCours] = useState(null);       // format en cours
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    setErreur(null);
    fetch(`/api/mes-cours?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Vos cours ne se lisent pas.'); return j; })
      .then(j => {
        const l = j.cours || []; setCours(l);
        // Par défaut : tous MES cours (ceux de la section restent à cocher).
        const miens = l.filter(x => x.a_moi).map(x => x.cours_code);
        setCoches(new Set(miens.length ? miens : l.slice(0, 1).map(x => x.cours_code)));
      })
      .catch(e => { setCours([]); setErreur(e.message); });
    fetch('/api/mes-cours/editions/catalogue', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setCatalogue).catch(() => setCatalogue(null));
  }, [annee]);

  const def = useMemo(() => catalogue?.pieces.find(p => p.id === piece) || null, [catalogue, piece]);
  const choisis = useMemo(() => (cours || []).filter(x => coches.has(x.cours_code)), [cours, coches]);
  const codes = def?.sansCours ? (cours || []).slice(0, 1).map(x => x.cours_code) : choisis.map(x => x.cours_code);
  const pret = !!def && codes.length > 0;
  const url = format => `/api/mes-cours/editions/${def.id}?cours=${encodeURIComponent(codes.join(','))}&annee=${encodeURIComponent(annee)}`
    + `${def.session ? `&session=${session}` : ''}${format ? `&format=${format}` : ''}`;

  const apercu = async () => {
    setErreur(null); setEnCours('html');
    try {
      const r = await fetch(url('html'), { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.html) throw new Error(j.error || 'La pièce n’a pas pu être composée.');
      ouvrirApercu({ html: j.html, titre: def.libelle, sousTitre: j.sous || annee, nomFichier: j.nom, envoiPossible: false,
        astuceImpression: def.paysage ? 'A4 paysage' : 'A4 portrait' });
    } catch (e) { setErreur(e.message); } finally { setEnCours(null); }
  };
  const sortir = async format => {
    setErreur(null); setEnCours(format);
    try { await telecharger(url(format), `${def.id}.${format}`); }
    catch (e) {
      // Sans PDF sur le serveur : l'aperçu, d'où l'on imprime.
      if (e.html) ouvrirApercu({ html: e.html, titre: def.libelle, nomFichier: e.nom, envoiPossible: false, astuceImpression: def.paysage ? 'A4 paysage' : 'A4 portrait' });
      else setErreur(e.message);
    } finally { setEnCours(null); }
  };

  if (cours === null) return <p className="text-second text-slate-500">Chargement…</p>;
  const miens = cours.filter(x => x.a_moi), section = cours.filter(x => !x.a_moi);
  const libelle = x => `UE ${x.ue_num} · ${x.cours_code}${x.cours_nom ? ` — ${x.cours_nom}` : ''}`;
  const basculer = code => setCoches(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const tous = l => l.length > 0 && l.every(x => coches.has(x.cours_code));
  const basculerTous = l => setCoches(s => { const n = new Set(s); const t = tous(l); l.forEach(x => (t ? n.delete(x.cours_code) : n.add(x.cours_code))); return n; });
  const nbEtudiants = choisis.reduce((t, x) => t + (Number(x.nb_etudiants) || 0), 0);

  const Groupe = ({ titre, liste }) => liste.length > 0 && (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-second font-semibold text-slate-600 cursor-pointer">
        <input type="checkbox" checked={tous(liste)} ref={el => { if (el) el.indeterminate = !tous(liste) && liste.some(x => coches.has(x.cours_code)); }}
          onChange={() => basculerTous(liste)} />
        {titre} — tous ({liste.length})
      </label>
      {liste.map(x => (
        <label key={x.cours_code} className="flex items-center gap-2 text-sm pl-5 cursor-pointer min-w-0">
          <input type="checkbox" checked={coches.has(x.cours_code)} onChange={() => basculer(x.cours_code)} />
          <span className="truncate min-w-0">{libelle(x)}</span>
          <span className="text-mention text-slate-400 flex-none">{x.nb_etudiants ?? 0} ét.</span>
        </label>))}
    </div>);

  return (
    <div className="space-y-3">
      {erreur && <Encadre etat="corriger" icone={IconAlertTriangle} titre={erreur} />}
      {!catalogue && <Encadre etat="surveiller" titre="Le catalogue des pièces ne se lit pas." />}

      {/* 1 — QUELLE PIÈCE ? */}
      <section className="rounded-carte p-3 space-y-3" style={ZONE}>
        <Etape n={1} titre="Quelle pièce ?" fait={!!def} />
        {catalogue && catalogue.familles.map(f => {
          const Ic = ICONES[f.k] || IconFileText;
          return (
            <div key={f.k} className="carte overflow-hidden">
              <EnteteCarte icone={Ic} titre={f.libelle} />
              <ListeEtats className="!border-0 !rounded-none">
                {catalogue.pieces.filter(p => p.famille === f.k).map(p => (
                  <LigneEtat key={p.id} etat={piece === p.id ? 'disponible' : 'neutre'} titre={p.libelle} sous={p.aide}
                    meta={piece === p.id ? <IconCheck size={15} className="text-iip-blue" /> : null}
                    onClick={() => setPiece(p.id)} />))}
              </ListeEtats>
            </div>);
        })}
      </section>

      {/* 2 — POUR QUELS COURS ? */}
      <section className="rounded-carte p-3 space-y-3" style={ZONE}>
        <Etape n={2} titre={def?.sansCours ? 'Pour quels cours ? — sans objet : tous vos cours' : 'Pour quels cours ?'}
          fait={!!def && codes.length > 0} attend={!def}>
          {def && !def.sansCours && <span className="text-second font-normal text-slate-500">{choisis.length} cours · {nbEtudiants} étudiant(s)</span>}
          {def?.session && (
            <span className="segments flex ml-auto" role="group" aria-label="Session">
              {[1, 2].map(n => <button key={n} type="button" onClick={() => setSession(n)}
                className={session === n ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{n === 1 ? '1re session' : '2e session'}</button>)}
            </span>)}
        </Etape>
        {!def ? <p className="text-second text-slate-500">Choisissez d’abord la pièce.</p>
          : def.sansCours ? <p className="text-second text-slate-500">Cette pièce porte toute votre année.</p>
          : !cours.length ? <p className="text-second text-slate-500">Aucun cours cette année.</p>
          : <div className="carte p-3 space-y-3"><Groupe titre="Mes cours" liste={miens} /><Groupe titre="Cours de ma section" liste={section} /></div>}
      </section>

      {/* 3 — SORTIR */}
      <section className="rounded-carte p-3 space-y-3" style={ZONE}>
        <Etape n={3} titre="Sortir" attend={!pret}>
          {pret && <span className="text-second font-normal text-slate-500">
            {def.libelle}{def.sansCours ? '' : ` · ${codes.length} cours${codes.length > 1 ? ', chacun sur sa page' : ''}`}</span>}
        </Etape>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="bouton bouton-fort inline-flex items-center gap-1" disabled={!pret || !!enCours} onClick={apercu}>
            <IconEye size={15} /> {enCours === 'html' ? 'Composition…' : 'Aperçu'}</button>
          <button type="button" className="bouton inline-flex items-center gap-1" disabled={!pret || !!enCours} onClick={() => sortir('pdf')}>
            <IconFileTypePdf size={15} /> {enCours === 'pdf' ? 'Composition…' : 'PDF'}</button>
          {def?.tableur && <button type="button" className="bouton inline-flex items-center gap-1" disabled={!pret || !!enCours} onClick={() => sortir('xlsx')}>
            <IconFileSpreadsheet size={15} /> {enCours === 'xlsx' ? 'Composition…' : 'Excel'}</button>}
          {!pret && <span className="text-second text-slate-500">{!def ? 'Choisissez une pièce.' : 'Cochez au moins un cours.'}</span>}
        </div>
      </section>
      <p className="text-mention text-slate-400">Ces pièces portent vos cotes de travail : elles sont pour vous, pas pour les étudiants.</p>
    </div>
  );
}
