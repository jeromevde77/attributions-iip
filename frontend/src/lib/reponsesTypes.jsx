/**
 * LES RÉPONSES TYPES, PARTOUT (3.1.21, Charles, 4 octobre 2026 : « de manière
 * générale, partout dans Lucie, je veux des réponses pré-établies »).
 *
 * Un seul hôte, `<ReponsesTypesHote />`, monté à la racine (main.jsx) comme les
 * boîtes de dialogue : il accroche un bouton « Réponses types » à TOUTE zone de
 * texte qui prend le focus. Aucun écran n'a rien à faire pour l'avoir — une
 * règle qu'il faut penser à appliquer écran par écran est une règle oubliée
 * une fois sur deux (les sept écrans passés sous le rail).
 *
 * LA CLÉ DU CHAMP : `data-reponses="…"` quand l'écran la donne (c'est le cas
 * des champs dont le catalogue est amorcé), sinon déduite de l'intitulé du
 * champ. `data-reponses="non"` retire le bouton.
 *
 * LES VARIABLES : {etudiant}, {matricule}, {ue}, {ue_nom}, {section},
 * {session}, {annee}, {date}, {moi}… L'écran déclare ce qu'il sait par
 * `useContexteReponses({ … })` ; ce qu'il ne sait pas reste entre crochets,
 * à compléter à la main — jamais un blanc qui passerait inaperçu.
 *
 * Insérer n'écrase rien : la phrase s'ajoute au curseur, et le champ reste
 * celui de l'écran, qui l'enregistre comme d'habitude.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconMessageDots, IconPencil, IconTrash, IconX, IconSearch, IconPlus } from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from './api.js';
import { demander, saisir } from './dialogue.jsx';

// ── Le contexte des variables ──────────────────────────────────────────────
let contexte = {};
const piles = [];
export function useContexteReponses(valeurs) {
  const cle = JSON.stringify(valeurs || {});
  useEffect(() => {
    const entree = { v: JSON.parse(cle) };
    piles.push(entree);
    contexte = Object.assign({}, ...piles.map(p => p.v));
    return () => {
      const i = piles.indexOf(entree);
      if (i >= 0) piles.splice(i, 1);
      contexte = Object.assign({}, ...piles.map(p => p.v));
    };
  }, [cle]);
}

const aujourdhui = () => new Date().toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
function moi() {
  const u = getUser() || {};
  return [u.prenom, u.nom].filter(Boolean).join(' ') || u.nom || '';
}
export function remplir(texte) {
  const v = { date: aujourdhui(), annee: getAnnee(), moi: moi(), ...contexte };
  return String(texte).replace(/\{([a-z_]+)\}/gi, (m, k) => {
    const x = v[k];
    return x != null && String(x).trim() !== '' ? String(x) : `[${k.replace(/_/g, ' ')}]`;
  });
}

// ── La clé et l'intitulé d'un champ ─────────────────────────────────────────
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const texteDe = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();

export function libelleDuChamp(ta) {
  if (ta.dataset.reponsesLibelle) return ta.dataset.reponsesLibelle;
  const label = ta.closest('label');
  if (label) {
    const premier = [...label.children].find(c => c !== ta && !c.contains(ta) && texteDe(c));
    if (premier) return texteDe(premier);
  }
  if (ta.id) {
    const l = document.querySelector(`label[for="${CSS.escape(ta.id)}"]`);
    if (l && texteDe(l)) return texteDe(l);
  }
  let el = ta;
  for (let n = 0; n < 3 && el; n++, el = el.parentElement) {
    const prec = el.previousElementSibling;
    if (prec && texteDe(prec) && texteDe(prec).length < 120) return texteDe(prec);
  }
  return ta.getAttribute('aria-label') || ta.placeholder || ta.title || 'Texte libre';
}
export function cleDuChamp(ta) {
  return ta.dataset.reponses || slug(libelleDuChamp(ta)) || 'texte-libre';
}

/** Écrire dans un champ que React contrôle : le setter natif, puis l'événement. */
function inserer(ta, phrase) {
  const v = ta.value || '';
  const debut = ta.selectionStart ?? v.length;
  const fin = ta.selectionEnd ?? v.length;
  const avant = v.slice(0, debut);
  const sep = avant && !/\s$/.test(avant) ? (avant.endsWith('.') ? ' ' : '\n') : '';
  const nouveau = avant + sep + phrase + v.slice(fin);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, nouveau);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  const pos = (avant + sep + phrase).length;
  ta.focus();
  try { ta.setSelectionRange(pos, pos); } catch { /* */ }
}

const accepte = ta => ta && ta.tagName === 'TEXTAREA' && !ta.disabled && !ta.readOnly
  && ta.dataset.reponses !== 'non' && !ta.closest('[inert]');

async function appel(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: authHeaders() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

// ── L'hôte ─────────────────────────────────────────────────────────────────
export function ReponsesTypesHote() {
  const [cible, setCible] = useState(null);       // la zone de texte suivie
  const [ouvert, setOuvert] = useState(false);
  const [rect, setRect] = useState(null);
  const racine = useRef(null);

  // Suivre la zone de texte qui a le focus.
  useEffect(() => {
    const entre = e => { if (accepte(e.target)) { setCible(e.target); } };
    const sort = e => {
      setTimeout(() => {
        const a = document.activeElement;
        if (racine.current?.contains(a)) return;
        if (accepte(a)) return;
        setOuvert(o => { if (!o) setCible(null); return o; });
      }, 120);
    };
    document.addEventListener('focusin', entre);
    document.addEventListener('focusout', sort);
    return () => { document.removeEventListener('focusin', entre); document.removeEventListener('focusout', sort); };
  }, []);

  // Suivre sa position (défilement, fenêtre qui s'ouvre, champ qui grandit).
  useEffect(() => {
    if (!cible) { setRect(null); return undefined; }
    let fini = false;
    const tour = () => {
      if (fini) return;
      if (!document.body.contains(cible)) { setCible(null); setOuvert(false); return; }
      const r = cible.getBoundingClientRect();
      setRect(p => (p && p.top === r.top && p.left === r.left && p.width === r.width && p.height === r.height ? p
        : { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right }));
      requestAnimationFrame(tour);
    };
    tour();
    return () => { fini = true; };
  }, [cible]);

  if (!cible || !rect || rect.width < 120) return null;
  return (
    <div ref={racine}>
      {!ouvert && (
        <button type="button" tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setOuvert(true)}
          title="Insérer une réponse pré-établie"
          className="fixed z-[80] inline-flex items-center gap-1 h-6 px-2 rounded-full bg-white border border-slate-300
                     text-xs text-slate-600 hover:text-iip-blue hover:border-iip-blue shadow-pose"
          style={{ top: rect.top + 5, left: rect.right - 128 }}>
          <IconMessageDots size={13} /> Réponses types
        </button>
      )}
      {ouvert && (
        <Panneau cible={cible} rect={rect} onFermer={() => { setOuvert(false); cible?.focus(); }} />
      )}
    </div>
  );
}

function Panneau({ cible, rect, onFermer }) {
  const champ = useMemo(() => cleDuChamp(cible), [cible]);
  const libelle = useMemo(() => libelleDuChamp(cible), [cible]);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [q, setQ] = useState('');
  const recherche = useRef(null);

  const charger = () => appel(`/api/reponses-types?champ=${encodeURIComponent(champ)}`)
    .then(setData).catch(e => setErreur(e.message));
  useEffect(() => { charger(); recherche.current?.focus(); /* eslint-disable-next-line */ }, [champ]);

  // Échap ferme le panneau, et lui seul — pas la fenêtre dessous.
  useEffect(() => {
    const f = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onFermer(); } };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, [onFermer]);

  const largeur = Math.max(360, Math.min(520, rect.width));
  const left = Math.min(Math.max(8, rect.right - largeur), window.innerWidth - largeur - 8);
  const placeDessous = window.innerHeight - rect.top - 40;
  const enHaut = placeDessous < 260;
  const style = enHaut
    ? { bottom: window.innerHeight - rect.top + 6, left, width: largeur }
    : { top: rect.top + 4, left, width: largeur };

  const liste = (data?.reponses || []).filter(r => !q || `${r.groupe || ''} ${r.texte}`.toLowerCase().includes(q.toLowerCase()));
  const groupes = [];
  for (const r of liste) {
    const g = r.commun ? (r.groupe || 'Catalogue commun') : 'Mes réponses';
    let x = groupes.find(y => y.g === g);
    if (!x) groupes.push(x = { g, l: [] });
    x.l.push(r);
  }

  async function enregistrer() {
    const texte = (cible.value || '').trim();
    if (!texte) { setErreur('Le champ est vide : écrivez d’abord la phrase, puis enregistrez-la.'); return; }
    let commun = false;
    if (data?.peut_commun) {
      commun = await demander({ message: 'Ajouter cette phrase au catalogue COMMUN (tout le monde la verra) ?\n\nNon : elle reste dans vos réponses personnelles.', ton: 'neutre' });
    }
    try {
      await appel('/api/reponses-types', { method: 'POST',
        body: JSON.stringify({ champ, champ_libelle: libelle, texte, commun }) });
      charger();
    } catch (e) { setErreur(e.message); }
  }
  async function modifier(r) {
    const t = await saisir({ message: 'Corriger la réponse type :', valeur: r.texte, multiligne: true, obligatoire: true });
    if (!t || !String(t).trim()) return;
    try { await appel(`/api/reponses-types/${r.id}`, { method: 'PUT', body: JSON.stringify({ texte: t }) }); charger(); }
    catch (e) { setErreur(e.message); }
  }
  async function supprimer(r) {
    if (!(await demander(`Supprimer cette réponse type${r.commun ? ' du catalogue commun' : ''} ?`))) return;
    try { await appel(`/api/reponses-types/${r.id}`, { method: 'DELETE' }); charger(); }
    catch (e) { setErreur(e.message); }
  }

  return (
    <div className="fixed z-[80] bg-white border border-slate-300 rounded-carte shadow-flottant flex flex-col"
      style={{ ...style, maxHeight: Math.min(420, enHaut ? rect.top - 16 : window.innerHeight - rect.top - 16) }}
      onMouseDown={e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }}>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 border-b border-slate-200">
        <IconMessageDots size={15} className="text-slate-400 flex-none" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-iip-texte">Réponses types</div>
          <div className="text-xs text-slate-400 truncate" title={libelle}>{libelle}</div>
        </div>
        <button type="button" onClick={onFermer} className="text-slate-400 hover:text-slate-600" aria-label="Fermer"><IconX size={15} /></button>
      </div>
      <div className="px-3 py-2 border-b border-slate-100 relative">
        <IconSearch size={13} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input ref={recherche} type="search" name="search_reponses" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Chercher une phrase…" className="controle controle-icone w-full text-second" />
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 py-1">
        {!data && !erreur && <p className="px-3 py-2 text-second text-slate-400">Chargement…</p>}
        {data && !liste.length && (
          <p className="px-3 py-3 text-second text-slate-500">
            {q ? 'Aucune phrase ne correspond.' : 'Aucune réponse type pour ce champ. Écrivez la vôtre dans le champ, puis « Enregistrer le texte du champ ».'}
          </p>
        )}
        {groupes.map(({ g, l }) => (
          <div key={g}>
            <div className="px-3 pt-2 pb-1 text-mention uppercase tracking-[.08em] font-semibold text-slate-400">{g}</div>
            {l.map(r => (
              <div key={r.id} className="group flex items-start gap-1 px-2">
                <button type="button" onClick={() => { inserer(cible, remplir(r.texte)); onFermer(); }}
                  className="flex-1 min-w-0 text-left px-1.5 py-1.5 rounded-champ hover:bg-slate-50 text-second text-slate-700 whitespace-pre-line line-clamp-4">
                  {remplir(r.texte)}
                </button>
                {(!r.commun || data.peut_commun) && (
                  <span className="flex-none flex flex-col gap-0.5 pt-1 opacity-0 group-hover:opacity-100">
                    <button type="button" title="Corriger" onClick={() => modifier(r)} className="text-slate-400 hover:text-iip-blue"><IconPencil size={13} /></button>
                    <button type="button" title="Supprimer" onClick={() => supprimer(r)} className="text-slate-400 hover:text-red-600"><IconTrash size={13} /></button>
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-slate-200 flex items-center gap-2">
        <button type="button" onClick={enregistrer} className="bouton bouton-compact inline-flex items-center gap-1">
          <IconPlus size={13} /> Enregistrer le texte du champ
        </button>
        {erreur && <span className="text-xs text-red-700 min-w-0">{erreur}</span>}
        {!erreur && <span className="text-xs text-slate-400 min-w-0">Les crochets restent à compléter.</span>}
      </div>
    </div>
  );
}
