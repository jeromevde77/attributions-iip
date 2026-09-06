import { useEffect, useMemo, useRef, useState } from 'react';
import { IconX, IconAlertTriangle, IconCheck, IconEqual } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Relier les acquis aux cours — au tracé, comme le schéma de capitalisation.
 *
 * LE LIEN EST LA PONDÉRATION : un acquis est évalué dans un cours dès qu'il y
 * porte un poids ; l'en retirer, c'est cesser de l'y évaluer. Tirer une flèche
 * d'un cours vers un acquis crée donc le lien AVEC un poids de 1, qu'on ajuste
 * ensuite.
 *
 * DIX POINTS À RÉPARTIR par cours, en nombres entiers. Le barème sur 100 des
 * classeurs de suivi reste accepté : seul le rapport entre les poids entre dans
 * le calcul, 3 sur 10 pèse comme 30 sur 100.
 *
 * Le dessin ne s'enregistre pas tout seul : un cours dont les dix points ne
 * sont pas répartis serait refusé par le serveur, et sauver à chaque geste
 * ferait échouer un réglage sur deux. On enregistre cours par cours, quand il
 * est juste.
 */

const L = 200, H = 34, GY = 10, PAD = 12, TETE = 26;
const X_COURS = PAD, X_AA = PAD + L + 200;
const LARGEUR = X_AA + L + PAD;

export default function SchemaLiensAA({ ueNum, annee, onClose, onEnregistre }) {
  const [data, setData] = useState(null);
  const [poids, setPoids] = useState({});      // `${cours}|${aa}` → entier
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [lien, setLien] = useState(null);      // tracé en cours : { cours, x, y, cible }
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
    data.cours.forEach((c, i) => { posC[c.cours_code] = { x: X_COURS, y: PAD + TETE + i * (H + GY) }; });
    data.acquis.forEach((a, i) => { posA[a.aa_code] = { x: X_AA, y: PAD + TETE + i * (H + GY) }; });
    const n = Math.max(data.cours.length, data.acquis.length, 1);
    return { posC, posA, hauteur: PAD * 2 + TETE + n * (H + GY) - GY };
  }, [data]);

  const sommes = useMemo(() => {
    const s = {};
    for (const [cle, v] of Object.entries(poids)) {
      if (!(Number(v) > 0)) continue;
      s[cle.split('|')[0]] = (s[cle.split('|')[0]] || 0) + Number(v);
    }
    return s;
  }, [poids]);

  const etatCours = c => {
    const s = sommes[c] || 0;
    if (s === 0) return { ok: false, libelle: '—', ton: '#94A3B8' };
    if (Math.abs(s - 10) < 0.001) return { ok: true, libelle: '10/10', ton: '#15803D' };
    if (Math.abs(s - 100) < 0.01) return { ok: true, libelle: '100', ton: '#0369A1' };
    return { ok: false, libelle: `${s}/10`, ton: '#B91C1C' };
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
    for (const a of data.acquis) {
      const q = layout.posA[a.aa_code];
      if (p.x >= q.x && p.x <= q.x + L && p.y >= q.y && p.y <= q.y + H) { cible = a.aa_code; break; }
    }
    setLien(l => l && ({ ...l, x: p.x, y: p.y, cible }));
  }
  function lienUp() {
    if (!lien) return;
    const { cours, cible } = lien;
    setLien(null);
    if (!cible) return;
    const cle = `${cours}|${cible}`;
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
              Tirez une flèche d'un cours vers un acquis pour l'y rattacher, puis
              répartissez <b>dix points</b> par cours.
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
                      <path d="M0,0 L0,5 L6,2.5 z" fill="#2563EB" />
                    </marker>
                  </defs>

                  <text x={X_COURS} y={PAD + 12} fontSize="11" fontWeight="700" fill="#64748B">COURS</text>
                  <text x={X_AA} y={PAD + 12} fontSize="11" fontWeight="700" fill="#64748B">ACQUIS D'APPRENTISSAGE</text>

                  {/* Les liens existants, avec leur poids et de quoi l'ajuster. */}
                  {data.cours.flatMap(c => data.acquis.map(a => {
                    const cle = `${c.cours_code}|${a.aa_code}`;
                    const v = Number(poids[cle]) || 0;
                    if (!(v > 0)) return null;
                    const p1 = layout.posC[c.cours_code], p2 = layout.posA[a.aa_code];
                    const x1 = p1.x + L, y1 = p1.y + H / 2, x2 = p2.x, y2 = p2.y + H / 2;
                    const mx = (x1 + x2) / 2;
                    return (
                      <g key={cle}>
                        <path d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 8},${y2}`}
                          fill="none" stroke="#2563EB" strokeWidth="1.6" markerEnd="url(#fl-aa)" />
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
                    <path d={`M${layout.posC[lien.cours].x + L},${layout.posC[lien.cours].y + H / 2}
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
                        {/* La poignée de tirage, à droite du cours. */}
                        <circle cx={p.x + L} cy={p.y + H / 2} r="6"
                          fill="#2563EB" style={{ cursor: 'crosshair' }}
                          onPointerDown={e => {
                            e.preventDefault();
                            const q = svgXY(e);
                            setLien({ cours: c.cours_code, x: q.x, y: q.y, cible: null });
                            e.currentTarget.setPointerCapture?.(e.pointerId);
                          }} />
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
                          {(a.description || '').slice(0, 34)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* L'enregistrement, cours par cours : le serveur refuse un cours
                  dont les dix points ne sont pas répartis, et sauver à chaque
                  geste ferait échouer un réglage sur deux. */}
              <div className="flex flex-wrap gap-2">
                {data.cours.map(c => {
                  const et = etatCours(c.cours_code);
                  const relie = data.acquis.some(a => Number(poids[`${c.cours_code}|${a.aa_code}`]) > 0);
                  return (
                    <span key={c.cours_code} className="inline-flex rounded-lg overflow-hidden border
                                                        border-slate-300">
                      <button onClick={() => enregistrer(c.cours_code, false)}
                        disabled={enCours || !et.ok}
                        className={`px-3 py-1.5 text-[12px] font-semibold border-r border-slate-300
                          ${et.ok ? 'text-iip-blue' : 'text-slate-400'}`}>
                        <IconCheck size={13} className="inline align-[-2px] mr-1" />
                        {c.cours_code} · {et.libelle}
                      </button>
                      <button onClick={() => enregistrer(c.cours_code, true)}
                        disabled={enCours || !relie}
                        title="Parité : tous les acquis de ce cours pèsent pareil"
                        className={`px-2.5 py-1.5 text-[12px] font-semibold
                          ${relie ? 'text-slate-600 hover:bg-slate-50' : 'text-slate-300'}`}>
                        <IconEqual size={13} className="inline align-[-2px] mr-1" />
                        Parité
                      </button>
                    </span>
                  );
                })}
              </div>

              <p className="text-[11.5px] text-slate-500">
                Tirez depuis le point bleu d'un cours jusqu'à un acquis pour l'y
                rattacher. Le lien naît à 1 point ; ajustez-le avec − et +, et
                ramenez-le à 0 pour le défaire. « Parité » donne à tous les acquis
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
