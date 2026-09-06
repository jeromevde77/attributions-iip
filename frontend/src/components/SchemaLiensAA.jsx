import { useEffect, useMemo, useRef, useState } from 'react';
import { IconX, IconAlertTriangle, IconCheck, IconEqual, IconDeviceFloppy }
  from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Relier les acquis aux cours — au tracé, comme le schéma de capitalisation.
 *
 * LA SOMME DES ACQUIS FAIT LE COURS. L'acquis est à gauche, le cours à droite,
 * et la flèche va de l'un à l'autre : ce n'est pas le cours qui donne l'acquis.
 *
 * LE LIEN EST LA PONDÉRATION : un acquis alimente un cours dès qu'il y porte un
 * poids ; l'en retirer, c'est l'en détacher. Tirer une flèche crée donc le lien
 * AVEC un poids de 1, qu'on ajuste ensuite.
 *
 * DIX POINTS À RÉPARTIR entre les acquis d'un cours, en nombres entiers. Le barème sur 100 des
 * classeurs de suivi reste accepté : seul le rapport entre les poids entre dans
 * le calcul, 3 sur 10 pèse comme 30 sur 100.
 *
 * Le dessin ne s'enregistre pas tout seul : un cours dont les dix points ne
 * sont pas répartis serait refusé par le serveur, et sauver à chaque geste
 * ferait échouer un réglage sur deux. On enregistre cours par cours, quand il
 * est juste.
 */

// LES ACQUIS À GAUCHE, LES COURS À DROITE, et la flèche va de l'acquis au
// cours. Ce n'est pas le cours qui donne l'acquis : c'est la SOMME DES ACQUIS
// QUI FAIT LE COURS, et les dix points se répartissent entre les acquis qui
// l'alimentent. Le schéma disait l'inverse et se lisait à rebours du calcul.
const L = 200, H = 34, GY = 10, PAD = 12, TETE = 26;
const X_AA = PAD, X_COURS = PAD + L + 200;
const LARGEUR = X_COURS + L + PAD;

export default function SchemaLiensAA({ ueNum, annee, onClose, onEnregistre }) {
  const [data, setData] = useState(null);
  const [poids, setPoids] = useState({});      // `${cours}|${aa}` → entier
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [lien, setLien] = useState(null);      // tracé en cours : { aa, x, y, cible }
  const [integree, setIntegree] = useState(false);
  const svgRef = useRef(null);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/liens?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error);
      setData(j);
      setIntegree(!!j.epreuve_integree);
      setPoids(Object.fromEntries(j.liens.map(l => [`${l.cours_code}|${l.aa_code}`, Number(l.poids)])));
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

  const layout = useMemo(() => {
    if (!data) return null;
    const posC = {}, posA = {};
    data.acquis.forEach((a, i) => { posA[a.aa_code] = { x: X_AA, y: PAD + TETE + i * (H + GY) }; });
    data.cours.forEach((c, i) => { posC[c.cours_code] = { x: X_COURS, y: PAD + TETE + i * (H + GY) }; });
    const n = Math.max(data.cours.length, data.acquis.length, 1);
    return { posC, posA, hauteur: PAD * 2 + TETE + n * (H + GY) - GY };
  }, [data]);

  /**
   * L'ÉTAT D'UN COURS — deux questions distinctes, longtemps confondues :
   * sa répartition est-elle VALIDE, et est-elle ENREGISTRÉE ?
   *
   * Une répartition est valide de trois façons : dix points répartis, le
   * barème sur 100 des classeurs, ou la PARITÉ — tous les acquis au même
   * poids. La parité écrit 1 partout : la somme vaut alors le nombre
   * d'acquis, jamais dix, et le cours passait en rouge « 3/10 » avec son
   * bouton grisé — on croyait avoir tout défait.
   */
  const liensDe = (c) => Object.entries(poids)
    .filter(([cle, v]) => cle.split('|')[0] === c && Number(v) > 0)
    .map(([cle, v]) => [cle.split('|')[1], Number(v)]);

  // Ce que le serveur a enregistré, pour savoir ce qui a changé depuis.
  const enBase = useMemo(() => Object.fromEntries(
    (data?.liens || []).map(l => [`${l.cours_code}|${l.aa_code}`, Number(l.poids)])), [data]);

  const etatCours = c => {
    const l = liensDe(c);
    const s = Math.round(l.reduce((n, [, v]) => n + v, 0) * 100) / 100;

    // Ce qui a changé depuis l'enregistrement : un poids ajouté, retiré, ou
    // modifié dans ce cours.
    const cles = new Set([
      ...Object.keys(poids).filter(k => k.split('|')[0] === c && Number(poids[k]) > 0),
      ...Object.keys(enBase).filter(k => k.split('|')[0] === c),
    ]);
    const modifie = [...cles].some(k => (Number(poids[k]) || 0) !== (enBase[k] || 0));

    if (!l.length) {
      return { ok: false, modifie, libelle: modifie ? 'à vider' : '—',
               ton: modifie ? '#B45309' : '#94A3B8', quoi: 'aucun acquis relié' };
    }
    // Un cours à UN SEUL acquis est valide quel que soit le poids : cet acquis
    // fait tout le cours. Le compter comme parité évite un rouge absurde.
    const parite = l.every(([, v]) => v === l[0][1]);
    const sur10 = Math.abs(s - 10) < 0.001;
    const sur100 = Math.abs(s - 100) < 0.01;
    const ok = sur10 || sur100 || parite;

    const quoi = sur10 ? '10 points répartis'
      : sur100 ? 'barème sur 100'
      : parite ? (l.length === 1 ? 'un seul acquis — tout le cours'
                                 : `parité — ${l.length} acquis à poids égal`)
      : `${s} points répartis au lieu de 10`;
    const libelle = sur10 ? '10/10' : sur100 ? '100'
      : parite ? (l.length === 1 ? 'seul' : 'parité') : `${s}/10`;

    return {
      ok, modifie, parite, libelle, quoi,
      // Vert : valide ET enregistré. Ambre : valide, reste à enregistrer.
      // Rouge : la répartition ne tient pas.
      ton: !ok ? '#B91C1C' : modifie ? '#B45309' : '#15803D',
    };
  };

  // Les coordonnées d'un pointeur sont en PIXELS ÉCRAN ; le dessin raisonne en
  // unités de viewBox. Sans cette conversion, le tracé viserait à côté dès que
  // le schéma n'est pas affiché à l'échelle exacte.
  function svgXY(e) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    const k = r.width ? LARGEUR / r.width : 1;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  function lienMove(e) {
    if (!lien || !layout) return;
    const p = svgXY(e);
    let cible = null;
    for (const c of data.cours) {
      const q = layout.posC[c.cours_code];
      if (p.x >= q.x && p.x <= q.x + L && p.y >= q.y && p.y <= q.y + H) { cible = c.cours_code; break; }
    }
    setLien(l => l && ({ ...l, x: p.x, y: p.y, cible }));
  }
  function lienUp() {
    if (!lien) return;
    const { aa, cible } = lien;
    setLien(null);
    if (!cible) return;
    const cle = `${cible}|${aa}`;
    // Un lien nouveau naît avec un poids de 1 : il existe, il reste à le peser.
    if (!(Number(poids[cle]) > 0)) setPoids(m => ({ ...m, [cle]: 1 }));
  }

  const majPoids = (cle, delta) => setPoids(m => {
    const v = Math.max(0, Math.min(100, (Number(m[cle]) || 0) + delta));
    return { ...m, [cle]: v };
  });

  /**
   * PARITÉ : tous les acquis du cours pèsent pareil. Trois acquis, un tiers
   * chacun — ce qui ne se répartit pas en dix points entiers. Comme seul le
   * rapport entre les poids compte, un poids de 1 partout dit exactement cela,
   * et la règle des dix points ne s'applique alors plus.
   */
  async function enregistrer(coursCode, parite) {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const ponderations = data.acquis.map(a => ({
        aa_code: a.aa_code, poids: Number(poids[`${coursCode}|${a.aa_code}`]) || 0,
      }));
      if (parite && !ponderations.some(p => p.poids > 0)) {
        setErreur('Reliez d’abord ce cours à ses acquis : la parité les répartit, elle ne les crée pas.');
        return;
      }
      const rep = await fetch('/api/acquis/ponderations', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ ue_num: ueNum, cours_code: coursCode, ponderations, parite }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setMessage(parite
        ? `Cours ${coursCode} : parité — tous ses acquis pèsent pareil.`
        : `Cours ${coursCode} enregistré.`);
      await charger();
      onEnregistre && onEnregistre();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /** Les cours dont la répartition est valide mais pas encore enregistrée. */
  const aEnregistrer = (data?.cours || [])
    .filter(c => { const e = etatCours(c.cours_code); return e.ok && e.modifie; })
    .map(c => c.cours_code);

  /** Tout enregistrer d'un coup — cours par cours, le serveur les veut ainsi. */
  async function enregistrerTout() {
    setEnCours(true); setErreur(null); setMessage(null);
    let faits = 0;
    try {
      for (const code of aEnregistrer) {
        const ponderations = data.acquis.map(a => ({
          aa_code: a.aa_code, poids: Number(poids[`${code}|${a.aa_code}`]) || 0,
        }));
        const rep = await fetch('/api/acquis/ponderations', {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({ ue_num: ueNum, cours_code: code, ponderations,
                                 parite: etatCours(code).parite }),
        });
        if (!rep.ok) {
          const j = await rep.json().catch(() => ({}));
          setErreur(`Cours ${code} : ${j.error || 'enregistrement refusé'}.`);
          break;
        }
        faits++;
      }
      if (faits) setMessage(`${faits} cours enregistré(s).`);
      await charger();
      onEnregistre && onEnregistre();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /**
   * L'ÉPREUVE INTÉGRÉE D'UNITÉ. Les professeurs d'une UE peuvent décider d'un
   * examen commun : on n'encode plus alors une note par cours, mais une note
   * par acquis pour l'unité entière, et chaque cours reçoit la note de l'unité.
   * Les liens ci-dessous restent utiles — ils pèsent les acquis entre eux.
   */
  async function basculerIntegree(v) {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const rep = await fetch(`/api/acquis/ue/${ueNum}/epreuve-integree`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, actif: v }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      setIntegree(v);
      setMessage(v ? "Épreuve intégrée : l'encodage se fera par acquis, pour l'unité."
                   : "Épreuve par cours rétablie.");
      onEnregistre && onEnregistre();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const orphelins = (data?.acquis || []).filter(a =>
    !(data?.cours || []).some(c => Number(poids[`${c.cours_code}|${a.aa_code}`]) > 0));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl mt-6
                      max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex-none p-5 pb-3 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-iip-blue">
              UE {ueNum}{data?.ue_nom ? ` · ${data.ue_nom}` : ''} — cours et acquis
            </h3>
            <p className="text-[12px] text-slate-500">
              Tirez une flèche d'un <b>acquis</b> vers le <b>cours</b> qu'il alimente :
              c'est la somme des acquis qui fait le cours. Répartissez ensuite
              <b>dix points</b> entre les acquis de chaque cours.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {erreur && <Bandeau ton="err">{erreur}</Bandeau>}
          {message && <Bandeau ton="ok">{message}</Bandeau>}

          {/* Le mode d'évaluation de l'unité, décidé avant tout encodage. */}
          <label className={`flex items-start gap-2.5 px-3 py-2 rounded-xl border cursor-pointer
            ${integree ? 'bg-violet-50 border-violet-300' : 'bg-slate-50 border-slate-200'}`}>
            <input type="checkbox" checked={integree} disabled={enCours}
              onChange={e => basculerIntegree(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-violet-600" />
            <span className="text-[12.5px]">
              <b className={integree ? 'text-violet-900' : 'text-slate-700'}>
                Épreuve intégrée d'unité
              </b>
              <span className="block text-[11.5px] text-slate-600">
                Les professeurs de l'unité organisent une épreuve commune. On
                n'encode alors plus une note par cours, mais <b>une note par acquis
                pour l'unité</b> ; chaque cours reçoit la note de l'unité.
              </span>
            </span>
          </label>

          {!data ? (
            <div className="py-8 text-center text-slate-400 text-sm">Chargement…</div>
          ) : !data.cours.length || !data.acquis.length ? (
            <Bandeau ton="alerte">
              {!data.cours.length
                ? `Aucun cours au référentiel de cette unité pour ${annee}.`
                : "Aucun acquis d'apprentissage au référentiel de cette unité."}
              {' '}Le rattachement suppose les deux.
            </Bandeau>
          ) : (
            <>
              {!!orphelins.length && (
                <Bandeau ton="alerte">
                  <b>{orphelins.length} acquis</b> ne sont évalués par aucun cours :
                  {' '}{orphelins.map(a => a.aa_code).join(' · ')}. Tant qu'ils le
                  restent, ils ne peuvent recevoir aucune note.
                </Bandeau>
              )}

              <div className="border border-slate-200 rounded-xl bg-white overflow-x-auto">
                <svg ref={svgRef}
                  viewBox={`0 0 ${LARGEUR} ${layout.hauteur}`}
                  onPointerMove={lienMove} onPointerUp={lienUp} onPointerLeave={lienUp}
                  style={{ width: LARGEUR, maxWidth: 'none', height: 'auto', display: 'block',
                           touchAction: 'none' }}>
                  <defs>
                    <marker id="fl-aa" markerWidth="7" markerHeight="7" refX="6" refY="2.5"
                      orient="auto" markerUnits="strokeWidth">
                      <path d="M0,0 L0,5 L6,2.5 z" fill="#0EA5E9" />
                    </marker>
                  </defs>

                  <text x={X_AA} y={PAD + 12} fontSize="11" fontWeight="700" fill="#64748B">ACQUIS D'APPRENTISSAGE</text>
                  <text x={X_COURS} y={PAD + 12} fontSize="11" fontWeight="700" fill="#64748B">COURS</text>

                  {/* Les liens existants, avec leur poids et de quoi l'ajuster. */}
                  {data.cours.flatMap(c => data.acquis.map(a => {
                    const cle = `${c.cours_code}|${a.aa_code}`;
                    const v = Number(poids[cle]) || 0;
                    if (!(v > 0)) return null;
                    const p1 = layout.posA[a.aa_code], p2 = layout.posC[c.cours_code];
                    const x1 = p1.x + L, y1 = p1.y + H / 2, x2 = p2.x, y2 = p2.y + H / 2;
                    const mx = (x1 + x2) / 2;
                    return (
                      <g key={cle}>
                        <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 8},${y2}`}
                          fill="none" stroke="#0EA5E9" strokeWidth="1.6" markerEnd="url(#fl-aa)" />
                        {/* Le poids, au milieu du lien : − retire un point, +
                            en ajoute, et zéro défait le lien. */}
                        <g transform={`translate(${mx - 26}, ${(y1 + y2) / 2 - 11})`}>
                          <rect width="52" height="22" rx="11" fill="#EFF6FF" stroke="#93C5FD" />
                          <text x="10" y="15" fontSize="13" fill="#1D4ED8" style={{ cursor: 'pointer' }}
                            onClick={() => majPoids(cle, -1)}>−</text>
                          <text x="26" y="15" fontSize="12" fontWeight="700" fill="#1E3A8A"
                            textAnchor="middle">{v}</text>
                          <text x="38" y="15" fontSize="13" fill="#1D4ED8" style={{ cursor: 'pointer' }}
                            onClick={() => majPoids(cle, 1)}>+</text>
                        </g>
                      </g>
                    );
                  }))}

                  {/* Le lien qu'on est en train de tirer. */}
                  {lien && (
                    <path d={`M${layout.posA[lien.aa].x + L},${layout.posA[lien.aa].y + H / 2}
                              L${lien.x},${lien.y}`}
                      fill="none" stroke="#93C5FD" strokeWidth="2" strokeDasharray="4 3" />
                  )}

                  {/* Les COURS. On tire depuis leur bord droit. */}
                  {data.cours.map(c => {
                    const p = layout.posC[c.cours_code];
                    const et = etatCours(c.cours_code);
                    return (
                      <g key={c.cours_code}>
                        <rect x={p.x} y={p.y} width={L} height={H} rx="8"
                          fill="#F8FAFC" stroke="#1B2B4B" strokeWidth="1.2" />
                        <text x={p.x + 8} y={p.y + 14} fontSize="11" fontWeight="700" fill="#1B2B4B">
                          {c.cours_code}
                        </text>
                        <text x={p.x + 8} y={p.y + 26} fontSize="9" fill="#475569">
                          {(c.cours_nom || '').slice(0, 30)}
                        </text>
                        <text x={p.x + L - 8} y={p.y + 21} fontSize="10" fontWeight="700"
                          textAnchor="end" fill={et.ton}>{et.libelle}</text>
                      </g>
                    );
                  })}

                  {/* Les ACQUIS. Ceux que personne n'évalue sont signalés. */}
                  {data.acquis.map(a => {
                    const p = layout.posA[a.aa_code];
                    const orphelin = orphelins.some(o => o.aa_code === a.aa_code);
                    return (
                      <g key={a.aa_code}>
                        <rect x={p.x} y={p.y} width={L} height={H} rx="8"
                          fill={orphelin ? '#FFFBEB' : '#F0F9FF'}
                          stroke={orphelin ? '#F59E0B' : '#0EA5E9'}
                          strokeWidth="1.2" strokeDasharray={orphelin ? '4 3' : ''} />
                        <text x={p.x + 8} y={p.y + 14} fontSize="11" fontWeight="700"
                          fill={orphelin ? '#92400E' : '#075985'}>{a.aa_code}</text>
                        <text x={p.x + 8} y={p.y + 26} fontSize="9" fill="#475569">
                          {(a.description || '').slice(0, 30)}
                        </text>
                        {/* La poignée est sur l'ACQUIS : c'est lui qui alimente
                            un cours, et le geste doit dire ce sens-là. */}
                        <circle cx={p.x + L} cy={p.y + H / 2} r="6"
                          fill="#0EA5E9" style={{ cursor: 'crosshair' }}
                          onPointerDown={e => {
                            e.preventDefault();
                            const q = svgXY(e);
                            setLien({ aa: a.aa_code, x: q.x, y: q.y, cible: null });
                            e.currentTarget.setPointerCapture?.(e.pointerId);
                          }} />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* CHAQUE COURS DIT OÙ IL EN EST : vert enregistré, ambre à
                  enregistrer, rouge répartition invalide. Sans cela on ne
                  savait pas ce qui était pris en compte. */}
              <div className="flex flex-wrap gap-2 items-center">
                {data.cours.map(c => {
                  const et = etatCours(c.cours_code);
                  const relie = data.acquis.some(a => Number(poids[`${c.cours_code}|${a.aa_code}`]) > 0);
                  const ton = !et.ok ? 'border-red-300 bg-red-50 text-red-800'
                    : et.modifie ? 'border-amber-400 bg-amber-50 text-amber-900'
                    : 'border-emerald-400 bg-emerald-50 text-emerald-800';
                  return (
                    <span key={c.cours_code}
                      className={`inline-flex items-stretch rounded-lg overflow-hidden border ${ton}`}>
                      <span className="px-2.5 py-1 border-r border-current/20">
                        <span className="block text-[12px] font-bold font-mono leading-tight">
                          {c.cours_code}
                        </span>
                        <span className="block text-[9.5px] opacity-80 leading-tight">{et.quoi}</span>
                      </span>
                      <button onClick={() => enregistrer(c.cours_code, false)}
                        disabled={enCours || !et.ok || !et.modifie}
                        title={!et.ok ? et.quoi
                          : et.modifie ? 'Enregistrer ce cours' : 'Déjà enregistré'}
                        className="px-2.5 text-[11.5px] font-semibold border-r border-current/20
                                   disabled:opacity-45 flex items-center gap-1">
                        {et.ok && !et.modifie
                          ? <><IconCheck size={13} /> enregistré</>
                          : <><IconDeviceFloppy size={13} /> enregistrer</>}
                      </button>
                      <button onClick={() => enregistrer(c.cours_code, true)}
                        disabled={enCours || !relie}
                        title="Parité : tous les acquis de ce cours pèsent pareil — enregistré aussitôt"
                        className="px-2 text-[11.5px] font-semibold disabled:opacity-40
                                   flex items-center gap-1">
                        <IconEqual size={13} /> parité
                      </button>
                    </span>
                  );
                })}

                {/* Le geste global : tout ce qui est valide et modifié part
                    d'un coup, cours par cours. */}
                {aEnregistrer.length > 1 && (
                  <button onClick={enregistrerTout} disabled={enCours}
                    className="px-3 py-2 text-[12px] rounded-lg bg-iip-blue text-white
                               font-semibold disabled:opacity-40 flex items-center gap-1.5">
                    <IconDeviceFloppy size={14} />
                    Enregistrer les {aEnregistrer.length} cours modifiés
                  </button>
                )}
              </div>

              <p className="text-[11.5px] text-slate-500">
                Tirez depuis le point bleu d'un acquis jusqu'au cours qu'il
                alimente. Le lien naît à 1 point ; ajustez-le avec − et +, et
                ramenez-le à 0 pour le défaire. Chaque cours porte son état :
                <b className="text-emerald-700"> vert</b> enregistré,
                <b className="text-amber-700"> ambre</b> à enregistrer,
                <b className="text-red-700"> rouge</b> répartition à revoir.
                « Parité » donne à tous les acquis
                d'un cours le même poids, sans avoir à répartir dix points — utile
                quand ils ne se divisent pas en entiers. Un acquis peut être évalué par
                plusieurs cours : sa note globale est alors la moyenne de ses
                évaluations, pondérée par ces poids.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Bandeau({ ton, children }) {
  const c = ton === 'err' ? 'bg-red-50 border-red-200 text-red-800'
    : ton === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
    : 'bg-amber-50 border-amber-200 text-amber-900';
  return (
    <div className={`px-3 py-2 rounded-lg border text-[12.5px] flex items-start gap-1.5 ${c}`}>
      {ton === 'alerte' && <IconAlertTriangle size={15} className="mt-0.5 flex-none" />}
      <span>{children}</span>
    </div>
  );
}
