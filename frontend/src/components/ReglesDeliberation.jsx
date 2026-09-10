import { useEffect, useState } from 'react';
import { IconX, IconLock, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LES RÈGLES DE DÉLIBÉRATION DE L'ÉTABLISSEMENT.
 *
 * Lucie n'est pas faite pour un seul institut. Ce que le décret impose est
 * intangible ; le reste — ce sur quoi le Conseil délibère, ce qu'il ajourne
 * d'office, comment il arrondit — appartient à la maison, et se réglait
 * jusqu'ici dans le code.
 *
 * LE PREMIER CHOIX EST LE PLUS LOURD : SUR QUOI DÉLIBÈRE-T-ON ?
 *
 * Ce n'est pas une question d'affichage. C'est le niveau auquel la maîtrise
 * s'apprécie, et donc ce qui peut faire échouer une unité. En promotion
 * sociale, c'est l'acquis d'apprentissage qui est sanctionné ; ailleurs, on
 * raisonne par cours. Une école qui délibère sur les acquis ne doit pas voir
 * une unité bloquée par une note de cours, et réciproquement.
 *
 * CE QUE LE DÉCRET VERROUILLE EST MONTRÉ, non caché : une règle qu'on ne
 * peut pas changer et qu'on ne voit pas ressemble à un défaut du logiciel.
 */
/**
 * LES DEUX NIVEAUX QU'ON PEUT METTRE DANS LA DÉLIBÉRATION.
 *
 * On les fait glisser dans la zone, ou l'on clique dessus. Ce qui s'y trouve
 * est ce sur quoi le Conseil statue ; l'unité, elle, y est toujours et ne se
 * retire pas — c'est elle que l'attestation sanctionne.
 *
 * La combinaison DIT la forme de l'écran, plutôt que de la faire choisir dans
 * une liste de quatre lignes où l'on ne voit pas ce qu'on obtient :
 *
 *   cours + acquis   le tableau à double entrée
 *   cours seul       une ligne de cours, et l'unité
 *   acquis seul      une ligne d'acquis, et l'unité
 *   ni l'un ni l'autre   l'unité seule
 */
const NIVEAUX = {
  cours: { titre: 'Cours', detail: 'la note de chaque cours de l’unité' },
  aa: { titre: 'Acquis', detail: 'la maîtrise de chaque acquis d’apprentissage' },
};

/** La combinaison choisie → la règle enregistrée, et l'inverse. */
const versBase = ({ aa, cours }) => (aa && cours ? 'cours_aa' : aa ? 'aa' : cours ? 'cours' : 'ue');
const depuisBase = b => ({ aa: b === 'cours_aa' || b === 'aa',
                           cours: b === 'cours_aa' || b === 'cours' });

const APERCU = {
  cours_aa: 'Le tableau à double entrée — acquis en lignes, cours en colonnes, '
          + 'la note d’unité au croisement.',
  cours: 'Une ligne par cours et la note d’unité. Les acquis restent encodés et '
       + 'imprimables, mais ne font pas la décision.',
  aa: 'Une ligne par acquis et la note d’unité. Les cours ne sont plus opposés — '
    + 'la lecture de la promotion sociale.',
  ue: 'La seule note d’unité. Ni les acquis ni les cours ne peuvent la faire échouer.',
};

/** Un niveau, qu'on prend et qu'on pose — ou qu'on clique. */
function Jeton({ cle, dans, onBasculer }) {
  const n = NIVEAUX[cle];
  return (
    <button draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', cle)}
      onClick={() => onBasculer(cle)}
      title={dans ? 'Retirer de la délibération' : 'Mettre dans la délibération'}
      className={`text-left px-3 py-2 rounded-xl border cursor-grab active:cursor-grabbing
        ${dans ? 'border-iip-blue bg-white shadow-sm' : 'border-dashed border-slate-300 bg-white'}`}>
      <span className="text-[12.5px] font-semibold text-slate-800">{n.titre}</span>
      <span className="block text-[11px] text-slate-500">{n.detail}</span>
    </button>
  );
}

/**
 * LA ZONE DE DÉLIBÉRATION — les niveaux qu'on y dépose peuvent faire échouer
 * l'unité. Elle sert DEUX FOIS : une par session, car juin et septembre ne se
 * délibèrent pas dans les mêmes termes.
 */
function ZoneBase({ valeur, onChange }) {
  const sel = depuisBase(valeur);
  const basculer = c => onChange(versBase({ ...sel, [c]: !sel[c] }));
  const poser = (c, dedans) => {
    if (sel[c] !== dedans) onChange(versBase({ ...sel, [c]: dedans }));
  };
  const dispos = Object.keys(NIVEAUX).filter(c => !sel[c]);
  const dedans = Object.keys(NIVEAUX).filter(c => sel[c]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault();
          poser(e.dataTransfer.getData('text/plain'), false); }}
        className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
        <div className="text-[10.5px] uppercase tracking-wide text-slate-400">
          Disponibles
        </div>
        {dispos.map(c => (
          <Jeton key={c} cle={c} dans={false} onBasculer={basculer} />
        ))}
        {!dispos.length && (
          <div className="text-[11px] text-slate-400 italic py-2">
            Tout est dans la délibération.
          </div>
        )}
      </div>

      <div onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault();
          poser(e.dataTransfer.getData('text/plain'), true); }}
        className="rounded-xl border-2 border-iip-blue/40 bg-iip-blue/5 p-2.5 space-y-2">
        <div className="text-[10.5px] uppercase tracking-wide text-iip-blue">
          Le Conseil délibère sur
        </div>
        {/* L'UNITÉ NE SE RETIRE PAS. La montrer scellée vaut mieux
            que de la taire : sans elle, on croirait pouvoir tout
            enlever, et l'on chercherait pourquoi c'est refusé. */}
        <div className="px-3 py-2 rounded-xl border border-iip-blue
                        bg-iip-blue/10">
          <span className="text-[12.5px] font-semibold text-iip-blue">
            Unité <span className="text-[10px] font-normal">— toujours</span>
          </span>
          <span className="block text-[11px] text-slate-500">
            la note de l'unité d'enseignement
          </span>
        </div>
        {dedans.map(c => (
          <Jeton key={c} cle={c} dans onBasculer={basculer} />
        ))}
        {!dedans.length && (
          <div className="text-[11px] text-slate-400 italic py-2">
            Déposez ici un niveau, ou laissez l'unité seule.
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReglesDeliberation({ onClose, onFini }) {
  const [etat, setEtat] = useState(null);
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rep = await fetch('/api/acquis/deliberation/regles', { headers: authHeaders() });
        const j = await rep.json();
        if (!rep.ok) throw new Error(j.error);
        setEtat(j); setR(j.regles);
      } catch (e) { setErreur(e.message); }
    })();
  }, []);

  async function enregistrer() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/acquis/deliberation/regles', {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ regles: r }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setEtat(e => ({ ...e, regles: j.regles }));
      setR(j.regles); setFait(true); onFini?.();
      setTimeout(() => setFait(false), 2500);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const set = (k, v) => setR(x => ({ ...x, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-3
                    overflow-y-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[900px] my-4
                      max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b
                        border-slate-200 flex-shrink-0">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Règles de délibération de l'établissement
            </h3>
            <p className="text-[12px] text-slate-500">
              Ce que le décret impose ne se règle pas. Le reste appartient à la maison,
              et vaut pour toutes les unités.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                            text-[12.5px] text-red-800 flex items-start gap-2">
              <IconAlertTriangle size={15} className="mt-px shrink-0" /> {erreur}
            </div>
          )}
          {!r ? (
            <div className="py-10 text-center text-[12.5px] text-slate-400">Chargement…</div>
          ) : (
            <>
              {/* ── SUR QUOI ON DÉLIBÈRE ─────────────────────────────────── */}
              <div>
                <div className="text-[13px] font-semibold text-iip-blue">
                  Sur quoi le Conseil délibère
                </div>
                <p className="text-[11.5px] text-slate-500 mb-2">
                  Faites glisser les niveaux dans la zone de délibération — ou cliquez-les.
                  Ce qui s'y trouve peut faire échouer une unité. La note de l'unité y est
                  <b> toujours</b> : c'est elle que l'attestation sanctionne (RGE art. 77 §1).
                </p>
                <ZoneBase valeur={r.base} onChange={v => set('base', v)} />
                <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                text-[11.5px] text-amber-900">
                  <b>Ce que le Conseil verra en juin :</b> {APERCU[r.base]}
                </div>

                {/* ── ET EN SEPTEMBRE ────────────────────────────────────────
                    La seconde session ne se délibère pas dans les mêmes termes :
                    l'étudiant ne représente pas des cours, il représente les
                    acquis qui lui manquaient. Opposer encore une note de cours
                    le fait retomber sur une moyenne qui mêle ce qu'il vient de
                    représenter et ce qu'il avait déjà. C'était écrit en dur dans
                    le calcul — donc invisible et indiscutable. */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="text-[13px] font-semibold text-amber-800">
                    En seconde session
                  </div>
                  <p className="text-[11.5px] text-slate-500 mb-2">
                    Septembre peut se délibérer autrement que juin. Un niveau retiré
                    ici reste calculé et affiché, en tons plus clairs : le Conseil le
                    voit sans qu'il pèse sur la décision.
                  </p>
                  <ZoneBase valeur={r.base_s2 || 'aa'} onChange={v => set('base_s2', v)} />
                  <div className="mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                                  text-[11.5px] text-amber-900">
                    <b>Ce que le Conseil verra en septembre :</b> {APERCU[r.base_s2 || 'aa']}
                  </div>
                </div>
              </div>

              {/* ── LE SEUIL DE MAÎTRISE ─────────────────────────────────── */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="px-3 py-2.5 rounded-xl border border-slate-200">
                  <div className="text-[12.5px] font-semibold text-slate-800">
                    Seuil de maîtrise d'un acquis
                  </div>
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    Jamais sous {etat.seuil_ue}/20 : en dessous, un acquis non maîtrisé
                    passerait pour acquis. Au-dessus, la maison peut être plus exigeante.
                  </p>
                  <input type="number" min={etat.seuil_ue} max="20" step="0.5"
                    value={r.seuil_aa}
                    onChange={e => set('seuil_aa', e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded-lg text-[12.5px] w-24" />
                </div>
                <div className="px-3 py-2.5 rounded-xl border border-slate-200">
                  <div className="text-[12.5px] font-semibold text-slate-800">Arrondi des cotes</div>
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    Une cote arrondie à l'entier peut faire franchir le seuil à 9,6.
                  </p>
                  <select value={r.arrondi} onChange={e => set('arrondi', e.target.value)}
                    className="px-2 py-1 border border-slate-300 rounded-lg text-[12.5px]">
                    <option value="centieme">au centième (9,64)</option>
                    <option value="demi">au demi-point (9,5)</option>
                    <option value="entier">à l'entier (10)</option>
                  </select>
                </div>
              </div>

              {/* ── L'AJOURNEMENT D'OFFICE ───────────────────────────────── */}
              <div className="px-3 py-2.5 rounded-xl border border-slate-200">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={!!r.auto_s1} className="mt-0.5"
                    onChange={e => set('auto_s1', e.target.checked)} />
                  <span>
                    <span className="text-[12.5px] font-semibold text-slate-800">
                      Proposer l'ajournement d'office en première session
                    </span>
                    <span className="block text-[11px] text-slate-500">
                      Dès qu'un acquis n'est pas maîtrisé, Lucie <b>propose</b> ce qu'il y
                      aurait à ajourner. La décision reste au Conseil : rien n'est posé
                      sans son geste.
                    </span>
                  </span>
                </label>
                {r.auto_s1 && (
                  <div className="mt-2 pl-6">
                    <div className="text-[11.5px] text-slate-600 mb-1">
                      Ce qui serait ajourné :
                    </div>
                    <select value={r.portee} onChange={e => set('portee', e.target.value)}
                      className="px-2 py-1 border border-slate-300 rounded-lg text-[12.5px]">
                      <option value="cours">le cours qui évalue l'acquis</option>
                      <option value="aa">l'acquis seul</option>
                      <option value="ue">l'unité entière</option>
                    </select>
                  </div>
                )}
              </div>

              {/* ── LES PONDÉRATIONS MANQUANTES ──────────────────────────── */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="px-3 py-2.5 rounded-xl border border-slate-200">
                  <div className="text-[12.5px] font-semibold text-slate-800">
                    Acquis sans pondération
                  </div>
                  <select value={r.aa_sans_poids} onChange={e => set('aa_sans_poids', e.target.value)}
                    className="mt-1.5 px-2 py-1 border border-slate-300 rounded-lg text-[12.5px] w-full">
                    <option value="egal">tous à poids égal dans leur cours</option>
                    <option value="cours_seuls">ignorer les acquis, ne compter que les cours</option>
                  </select>
                </div>
                <div className="px-3 py-2.5 rounded-xl border border-slate-200">
                  <div className="text-[12.5px] font-semibold text-slate-800">
                    Cours sans pondération
                  </div>
                  <select value={r.cours_sans_poids}
                    onChange={e => set('cours_sans_poids', e.target.value)}
                    className="mt-1.5 px-2 py-1 border border-slate-300 rounded-lg text-[12.5px] w-full">
                    <option value="periodes">au prorata de leurs périodes</option>
                    <option value="egal">tous à poids égal dans l'unité</option>
                  </select>
                </div>
              </div>

              {/* ── LA SECONDE SESSION ───────────────────────────────────── */}
              <div className="px-3 py-2.5 rounded-xl border border-slate-200">
                <div className="text-[12.5px] font-semibold text-slate-800 mb-1.5">
                  Ce que l'ajourné représente en seconde session
                </div>
                <select value={r.session2} onChange={e => set('session2', e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded-lg text-[12.5px]">
                  <option value="par_cours">les seuls cours ajournés</option>
                  <option value="unique">toute l'unité</option>
                </select>
              </div>

              {/* ── CE QUE LE DÉCRET VERROUILLE ──────────────────────────── */}
              <div className="rounded-xl border border-slate-300 bg-slate-50 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                  <IconLock size={14} className="text-slate-500" />
                  <span className="text-[12.5px] font-semibold text-slate-700">
                    Ce que le décret impose — non modifiable
                  </span>
                </div>
                <div className="divide-y divide-slate-200">
                  {(etat.verrous || []).map((v, i) => (
                    <div key={i} className="px-3 py-1.5 flex items-baseline gap-2 text-[12px]">
                      <span className="flex-1 text-slate-700">{v.regle}</span>
                      <span className="text-[10.5px] text-slate-400 whitespace-nowrap">{v.ref}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center
                        justify-between gap-3 flex-shrink-0">
          <span className="text-[12px] text-emerald-700">
            {fait ? 'Règles enregistrées.' : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 text-[12.5px] rounded-lg border border-slate-300
                         text-slate-600">Fermer</button>
            <button disabled={enCours || !r} onClick={enregistrer}
              className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white
                         font-semibold disabled:opacity-40">
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
