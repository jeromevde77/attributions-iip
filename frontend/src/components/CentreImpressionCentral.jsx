import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconPrinter, IconUsers, IconSchool, IconChartBar, IconCalendarStats,
  IconBooks, IconAlertTriangle, IconChevronRight, IconChevronDown, IconSearch,
} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';

/**
 * LE CENTRE D'IMPRESSION — un seul endroit d'où tout sort.
 *
 * Dix-huit écrans produisaient des documents, chacun avec sa mécanique et ses
 * options : on ne savait plus où sortir quoi, et la même pièce s'obtenait
 * différemment selon le chemin pris. Les boutons restent où ils sont — on les
 * cherche là où on travaille — mais ils mènent ici.
 *
 * L'onglet Étudiants croise DEUX AXES. Le PÉRIMÈTRE — une section, des unités,
 * des cours pris dans des unités différentes — construit la liste ; la
 * SÉLECTION la restreint à ceux qu'on coche. On peut donc aussi bien sortir
 * toute une section que trois dossiers.
 *
 * UN COURS NE DÉSIGNE QUE DES PERSONNES : les pièces de délibération sont des
 * pièces d'unité, et le restent.
 */

const ONGLETS = [
  { cle: 'etudiants', label: 'Étudiants', icon: IconSchool },
  { cle: 'personnel', label: 'Personnel', icon: IconUsers },
  { cle: 'pilotage', label: 'Pilotage', icon: IconChartBar },
  { cle: 'organisation', label: 'Organisation', icon: IconCalendarStats },
  { cle: 'referentiels', label: 'Référentiels', icon: IconBooks },
];

const PIECES = [
  { cle: 'reussite', label: 'Attestations de réussite', nominatif: true },
  { cle: 'ajournement', label: 'Motivations d’ajournement', nominatif: true },
  { cle: 'refus', label: 'Motivations de refus', nominatif: true },
  { cle: 'pv', label: 'Procès-verbal de délibération', nominatif: false },
  { cle: 'conseil', label: 'Composition du Conseil', nominatif: false },
  { cle: 'grille', label: 'Grille de délibération', nominatif: false },
];

function EnChantier({ quoi }) {
  return (
    <div className="p-8 text-[13px] text-slate-500 max-w-xl">
      <p className="mb-2 font-medium text-slate-700">Pas encore ici.</p>
      <p>
        Les documents de {quoi} s’impriment aujourd’hui depuis leur écran. Ils
        rejoindront cet endroit — il reste à convenir de ce qu’on y met.
      </p>
    </div>
  );
}

function OngletEtudiants() {
  const annee = getAnnee();
  const [arbre, setArbre] = useState(null);
  const [session, setSession] = useState(1);
  const [sections, setSections] = useState(() => new Set());
  const [ues, setUes] = useState(() => new Set());
  const [cours, setCours] = useState(() => new Set());
  const [deplie, setDeplie] = useState(() => new Set());
  const [recherche, setRecherche] = useState('');
  const [liste, setListe] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [choix, setChoix] = useState({ reussite: true, ajournement: true, refus: true });
  const [separer, setSeparer] = useState(
    () => localStorage.getItem('impression.separer') === '1');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch(`/api/perimetre/arborescence?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(setArbre).catch(e => setErreur(e.message));
  }, [annee]);

  const bascule = (set, valeur) => {
    const n = new Set(set);
    n.has(valeur) ? n.delete(valeur) : n.add(valeur);
    return n;
  };

  const charger = useCallback(async () => {
    setErreur(null);
    if (!sections.size && !ues.size && !cours.size) { setListe(null); return; }
    try {
      const rep = await fetch('/api/perimetre/etudiants', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session,
          sections: [...sections], ue_nums: [...ues], cours_codes: [...cours],
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setListe(j);
      // Tous cochés par défaut DANS LE PÉRIMÈTRE choisi : la sélection sert à
      // restreindre, non à tout reconstruire. Rien n'est coché tant qu'aucun
      // périmètre n'est posé.
      setCoches(new Set(j.etudiants.filter(e => e.decide).map(e => e.id)));
    } catch (e) { setErreur(e.message); }
  }, [annee, session, sections, ues, cours]);
  useEffect(() => { charger(); }, [charger]);

  const etudiants = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const l = liste?.etudiants || [];
    return q ? l.filter(e => `${e.nom} ${e.prenom}`.toLowerCase().includes(q)) : l;
  }, [liste, recherche]);

  async function produire() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/documents-lot', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          annee, session, separer,
          ue_nums: (liste?.unites || []).map(u => u.ue_num),
          etudiants: [...coches],
          ...choix,
        }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      if (j.manques?.length) {
        setErreur(`${j.pieces} pièce(s), mais : ${j.manques.slice(0, 4).join(' · ')}`
          + (j.manques.length > 4 ? ' …' : ''));
      }
      const tout = j.separes
        ? [...(j.collectif ? [j.collectif] : []), ...j.documents]
        : [{ nom: (j.nom || 'documents').replace(/\.html$/, ''), html: j.html }];
      for (const d of tout) {
        const rp = await fetch('/api/impression/pdf', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ html: d.html, nom: d.nom, pagination: 'si-plusieurs' }),
        });
        if (!rp.ok) { setErreur(`${d.etudiant || d.nom} : PDF non produit.`); return; }
        const url = URL.createObjectURL(await rp.blob());
        const a = document.createElement('a');
        a.href = url; a.download = `${d.nom}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        await new Promise(r => setTimeout(r, 350));
      }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const rien = !sections.size && !ues.size && !cours.size;

  return (
    <div className="flex min-h-0 flex-1">
      {/* LE PÉRIMÈTRE */}
      <div className="w-[340px] border-r border-slate-200 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200">
          <div className="text-[12.5px] font-semibold text-iip-blue mb-1.5">Périmètre</div>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden w-full">
            {[[1, '1re session'], [2, '2e session']].map(([v, lib]) => (
              <button key={v} onClick={() => setSession(v)}
                className={`flex-1 px-2 py-1 text-[11.5px] ${session === v
                  ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                {lib}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2 space-y-2">
          {(arbre?.sections || []).map(sec => (
            <div key={sec}>
              <label className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50
                                cursor-pointer">
                <input type="checkbox" checked={sections.has(sec)}
                  onChange={() => setSections(s => bascule(s, sec))}
                  className="w-4 h-4 accent-iip-blue" />
                <span className="text-[12.5px] font-medium text-slate-800">{sec}</span>
              </label>
              <div className="pl-4">
                {(arbre?.unites || []).filter(u => u.section === sec).map(u => (
                  <div key={u.ue_num}>
                    <div className="flex items-center gap-1.5 px-1.5 py-0.5">
                      <input type="checkbox" checked={ues.has(u.ue_num)}
                        disabled={sections.has(sec)}
                        onChange={() => setUes(s => bascule(s, u.ue_num))}
                        className="w-3.5 h-3.5 accent-iip-blue disabled:opacity-40" />
                      <button onClick={() => setDeplie(d => bascule(d, u.ue_num))}
                        className="text-slate-400 hover:text-slate-700">
                        {deplie.has(u.ue_num)
                          ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
                      </button>
                      <span className="text-[12px] text-slate-700 truncate">
                        <b>{u.ue_num}</b> {u.ue_nom}
                      </span>
                    </div>
                    {deplie.has(u.ue_num) && (
                      <div className="pl-8">
                        {u.cours.map(c => (
                          <label key={c.cours_code}
                            className="flex items-center gap-1.5 px-1.5 py-0.5 cursor-pointer">
                            <input type="checkbox" checked={cours.has(c.cours_code)}
                              disabled={sections.has(sec) || ues.has(u.ue_num)}
                              onChange={() => setCours(s => bascule(s, c.cours_code))}
                              className="w-3.5 h-3.5 accent-iip-blue disabled:opacity-40" />
                            <span className="text-[11.5px] text-slate-500 truncate">
                              {c.cours_code} {c.cours_nom}
                            </span>
                          </label>
                        ))}
                        {!u.cours.length && (
                          <div className="text-[11px] text-slate-400 px-1.5">aucun cours</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!arbre && <div className="text-[12px] text-slate-400 p-2">Chargement…</div>}
        </div>

        <div className="px-3 py-2 border-t border-slate-200 text-[11px] text-slate-500">
          Un cours sert à désigner des personnes : les pièces restent celles de
          leur unité.
        </div>
      </div>

      {/* LES PERSONNES ET LES PIÈCES */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <div className="relative">
            <IconSearch size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Un nom…"
              className="pl-7 pr-2 py-1 text-[12px] border border-slate-300 rounded-lg w-48" />
          </div>
          <button onClick={() => setCoches(new Set(etudiants.filter(e => e.decide).map(e => e.id)))}
            className="text-[12px] text-iip-blue underline">tout cocher</button>
          <button onClick={() => setCoches(new Set())}
            className="text-[12px] text-slate-500 underline">tout décocher</button>
          <span className="flex-1" />
          <span className="text-[12px] text-slate-500">
            {coches.size} / {etudiants.length} étudiant(s)
            {liste?.unites?.length ? ` · ${liste.unites.length} unité(s)` : ''}
          </span>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {rien && (
            <p className="p-6 text-[12.5px] text-slate-400">
              Choisissez un périmètre à gauche : une section, des unités, ou des
              cours.
            </p>
          )}
          {!rien && !etudiants.length && (
            <p className="p-6 text-[12.5px] text-slate-400">
              Aucun étudiant dans ce périmètre.
            </p>
          )}
          {etudiants.map(e => (
            <label key={e.id}
              className={`flex items-center gap-2 px-3 py-1.5 border-b border-slate-100
                          cursor-pointer ${e.decide ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={coches.has(e.id)} disabled={!e.decide}
                onChange={() => setCoches(s => bascule(s, e.id))}
                className="w-4 h-4 accent-iip-blue" />
              <span className="flex-1 min-w-0">
                <span className="text-[12.5px] font-medium">{e.nom} {e.prenom}</span>
                <span className="block text-[11px] text-slate-500">
                  {e.decide
                    ? `${e.reussites} réussite(s) · ${e.echecs} échec(s) sur ${e.unites.length} unité(s)`
                    : 'aucune décision pour cette session'}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="border-t border-slate-200 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {PIECES.map(p => (
              <label key={p.cle}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border
                  cursor-pointer text-[12px] ${choix[p.cle]
                    ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200 text-slate-600'}`}>
                <input type="checkbox" checked={!!choix[p.cle]}
                  onChange={() => setChoix(c => ({ ...c, [p.cle]: !c[p.cle] }))}
                  className="w-3.5 h-3.5 accent-iip-blue" />
                {p.label}
                {!p.nominatif && <span className="text-[10px] text-slate-400">collectif</span>}
              </label>
            ))}
          </div>

          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-amber-50 text-amber-900 text-[12.5px]
                            flex items-start gap-2">
              <IconAlertTriangle size={15} className="flex-none mt-0.5" /> {erreur}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600 cursor-pointer">
              <input type="checkbox" checked={separer}
                onChange={e => {
                  setSeparer(e.target.checked);
                  localStorage.setItem('impression.separer', e.target.checked ? '1' : '0');
                }}
                className="w-4 h-4 accent-iip-blue" />
              Un document par étudiant
            </label>
            <span className="flex-1" />
            <button onClick={produire} disabled={enCours || !coches.size}
              className="px-4 py-2 text-[12.5px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40 inline-flex items-center gap-1.5">
              <IconPrinter size={14} />
              {enCours ? 'Production…' : `Produire pour ${coches.size} étudiant(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CentreImpressionCentral({ ongletInitial = 'etudiants', onClose }) {
  const [onglet, setOnglet] = useState(ongletInitial);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-[1180px] max-w-full h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
          <IconPrinter size={18} className="text-iip-blue" />
          <div className="flex-1">
            <h3 className="text-[15px] font-semibold text-iip-blue">Centre d’impression</h3>
            <p className="text-[11.5px] text-slate-500">
              Tout ce que Lucie imprime, au même endroit.
            </p>
          </div>
          <button onClick={onClose}
            className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300 text-slate-600">
            Fermer
          </button>
        </div>

        <div className="px-3 pt-2 border-b border-slate-200 flex gap-1">
          {ONGLETS.map(o => (
            <button key={o.cle} onClick={() => setOnglet(o.cle)}
              className={`px-3 py-1.5 text-[12.5px] rounded-t-lg inline-flex items-center gap-1.5
                ${onglet === o.cle
                  ? 'bg-iip-blue/5 text-iip-blue font-semibold border-b-2 border-iip-blue'
                  : 'text-slate-500 hover:text-slate-700'}`}>
              <o.icon size={14} /> {o.label}
            </button>
          ))}
        </div>

        {onglet === 'etudiants' ? <OngletEtudiants />
          : <EnChantier quoi={ONGLETS.find(o => o.cle === onglet)?.label.toLowerCase()} />}
      </div>
    </div>
  );
}
