import { useEffect, useMemo, useState } from 'react';
import { IconTargetArrow, IconLink, IconUnlink, IconAlertTriangle, IconPencil,
         IconArrowUp, IconArrowDown, IconListNumbers, IconCheck, IconX, IconTrash,
         IconGripVertical, IconPlus } from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';
import { chargerChapeaux } from '../lib/chapeaux.js';

/**
 * Acquis d'apprentissage d'une UE — présentés COMME DANS LE DOSSIER
 * PÉDAGOGIQUE, et mis en forme par glisser-déposer (Charles, 25 septembre
 * 2026).
 *
 * Trois niveaux : la phrase qui introduit toute l'unité (« Pour atteindre le
 * seuil de réussite, l'étudiant sera capable : »), les CHAPEAUX qui ouvrent
 * chacun un groupe (« face à des situations appliquées à l'imagerie
 * médicale, »), puis les acquis.
 *
 * La mise en forme est une LISTE de pièces — chapeaux et acquis mêlés — qu'on
 * range à la main. Un chapeau vaut pour les acquis qui le suivent, jusqu'au
 * prochain : c'est la règle de lib/chapeaux.js, et c'est elle qui transforme
 * la liste en données (le chapeau s'écrit sur le premier acquis qu'il
 * précède). Tout se prépare à l'écran puis s'enregistre d'un seul geste : un
 * ordre nouveau sous des chapeaux anciens ne doit jamais exister, même un
 * instant.
 *
 * Les libellés viennent du dossier approuvé par la FWB : les corriger, les
 * ranger et les chapeauter est réservé à la direction. Le rattachement d'un
 * acquis à un cours reste du travail pédagogique courant.
 */

let numeroPiece = 0;
const nouvelId = () => `ch-${++numeroPiece}`;

/** La liste des pièces à partir des acquis : un chapeau devant le premier
 *  acquis de chaque groupe, une ligne par paragraphe. */
function versPieces(acquis) {
  const pieces = [];
  for (const a of acquis) {
    if (a.chapeau) {
      for (const l of String(a.chapeau).split('\n').map(x => x.trim()).filter(Boolean)) {
        pieces.push({ type: 'chapeau', id: nouvelId(), texte: l });
      }
    }
    pieces.push({ type: 'aa', id: a.aa_code, code: a.aa_code });
  }
  return pieces;
}

/** Et l'inverse : l'ordre des acquis et le chapeau de chacun. Un chapeau posé
 *  après le dernier acquis n'introduit rien : on le signale. */
function versDonnees(pieces) {
  const ordre = [], chapeaux = {};
  let enAttente = [];
  for (const p of pieces) {
    if (p.type === 'chapeau') { if (p.texte.trim()) enAttente.push(p.texte.trim()); continue; }
    ordre.push(p.code);
    chapeaux[p.code] = enAttente.length ? enAttente.join('\n') : null;
    enAttente = [];
  }
  return { ordre, chapeaux, orphelin: enAttente.length > 0 };
}

export default function AcquisUE({ ueNum, annee, estAdmin }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [edition, setEdition] = useState(null);   // { code, nouveau_code, description }
  const [pieces, setPieces] = useState([]);
  const [intro, setIntro] = useState('');
  const [modifie, setModifie] = useState(false);
  const [glisse, setGlisse] = useState(null);     // id de la pièce tenue
  const [survol, setSurvol] = useState(null);     // index où elle tomberait
  const [message, setMessage] = useState(null);
  const peutCorriger = estAdmin || ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role);

  const parCode = useMemo(() => Object.fromEntries((data?.acquis || []).map(a => [a.aa_code, a])), [data]);

  async function envoyer(url, corps, method = 'PATCH') {
    setErreur(null);
    const rep = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(corps) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { alert(j.error || `Refusé (${rep.status})`); return null; }
    return j;
  }

  async function charger() {
    try {
      const p = annee ? `?annee=${encodeURIComponent(annee)}` : '';
      const rep = await fetch(`/api/aa/ue/${ueNum}${p}`, { headers: authHeaders() });
      if (!rep.ok) throw new Error('chargement impossible');
      const j = await rep.json();
      setData(j);
      setPieces(versPieces(j.acquis));
      setIntro(j.introduction || '');
      setModifie(false);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { if (ueNum) charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

  const poser = (fn) => { setPieces(p => fn([...p])); setModifie(true); setMessage(null); };

  // ── Glisser-déposer : on tient une pièce, on la lâche avant une autre. ──
  function lacher(index) {
    if (glisse == null) return;
    poser(p => {
      const de = p.findIndex(x => x.id === glisse);
      if (de < 0) return p;
      const [piece] = p.splice(de, 1);
      p.splice(de < index ? index - 1 : index, 0, piece);
      return p;
    });
    setGlisse(null); setSurvol(null);
  }
  // Le même geste au clavier et sans souris : monter, descendre.
  function deplacer(i, sens) {
    poser(p => { const j = i + sens; if (j < 0 || j >= p.length) return p; [p[i], p[j]] = [p[j], p[i]]; return p; });
  }
  const ajouterChapeau = (index) => poser(p => { p.splice(index, 0, { type: 'chapeau', id: nouvelId(), texte: '' }); return p; });
  const ecrireChapeau = (id, texte) => poser(p => p.map(x => (x.id === id ? { ...x, texte } : x)));
  const oterChapeau = (id) => poser(p => p.filter(x => x.id !== id));

  const { orphelin } = versDonnees(pieces);

  async function enregistrerForme() {
    const { ordre, chapeaux, orphelin: o } = versDonnees(pieces);
    if (o) return;
    const j = await envoyer(`/api/aa/ue/${ueNum}/presentation`, { introduction: intro, ordre, chapeaux }, 'PUT');
    if (j) { chargerChapeaux(ueNum, true); await charger(); setMessage('Mise en forme enregistrée.'); }
  }

  async function enregistrerEdition() {
    const { code, nouveau_code, description } = edition;
    const corps = {};
    if (nouveau_code.trim() && nouveau_code.trim() !== code) corps.nouveau_code = nouveau_code.trim();
    const avant = parCode[code]?.description || '';
    if (description.trim() && description.trim() !== avant) corps.description = description.trim();
    if (!Object.keys(corps).length) { setEdition(null); return; }
    if (corps.nouveau_code && !window.confirm(`Renommer ${code} en ${corps.nouveau_code} ?\n\nLe nouveau code sera repris partout : pondérations, notes, motivations, propositions des professeurs.`)) return;
    const j = await envoyer(`/api/aa/${encodeURIComponent(code)}`, corps);
    if (j) { setEdition(null); await charger(); }
  }

  /* SUPPRIMER UN ACQUIS — jamais à l'aveugle. Sans trace, il part tout de
     suite ; s'il est déjà évalué, le serveur dit d'abord ce qui serait emporté
     (notes, pondérations, motivations…), et l'on confirme en sachant quoi. */
  async function supprimer(a) {
    if (!window.confirm(`Supprimer l'acquis ${a.aa_code} ?\n\n« ${(a.description || '').slice(0, 140)} »`)) return;
    const url = `/api/aa/${encodeURIComponent(a.aa_code)}`;
    let rep = await fetch(url, { method: 'DELETE', headers: authHeaders() });
    let j = await rep.json().catch(() => ({}));
    if (rep.status === 409 && j.confirmation_requise) {
      const detail = Object.entries(j.inventaire || {}).map(([k, n]) => `  · ${n} ${k}`).join('\n');
      if (!window.confirm(`${a.aa_code} est déjà utilisé — seraient DÉFINITIVEMENT supprimés :\n${detail}\n\nSupprimer quand même ?`)) return;
      rep = await fetch(`${url}?force=1`, { method: 'DELETE', headers: authHeaders() });
      j = await rep.json().catch(() => ({}));
    }
    if (!rep.ok) { alert(j.error || `Refusé (${rep.status})`); return; }
    await charger();
  }

  /* CE N'EST PAS UN ACQUIS, C'EST UN CHAPEAU. L'import d'un dossier découpe
     parfois la phrase d'introduction en « acquis » (UE 901 : « dans les
     limites de son rôle… », « à partir de situations… »). Le geste supprime
     l'acquis — avec l'inventaire habituel s'il est déjà cité — et met son
     texte en chapeau, à la même place ; la mise en forme reste à enregistrer. */
  async function enChapeau(a) {
    if (!window.confirm(`${a.aa_code} n'est pas un acquis mais une phrase d'introduction ?\n\n« ${(a.description || '').slice(0, 140)} »\n\nL'acquis sera supprimé et son texte deviendra un chapeau, à la même place.`)) return;
    const url = `/api/aa/${encodeURIComponent(a.aa_code)}`;
    let rep = await fetch(url, { method: 'DELETE', headers: authHeaders() });
    let j = await rep.json().catch(() => ({}));
    if (rep.status === 409 && j.confirmation_requise) {
      const detail = Object.entries(j.inventaire || {}).map(([k, n]) => `  · ${n} ${k}`).join('\n');
      if (!window.confirm(`${a.aa_code} est déjà utilisé — seraient DÉFINITIVEMENT supprimés :\n${detail}\n\nContinuer ?`)) return;
      rep = await fetch(`${url}?force=1`, { method: 'DELETE', headers: authHeaders() });
      j = await rep.json().catch(() => ({}));
    }
    if (!rep.ok) { alert(j.error || `Refusé (${rep.status})`); return; }
    poser(p => p.map(x => (x.type === 'aa' && x.code === a.aa_code
      ? { type: 'chapeau', id: nouvelId(), texte: (a.description || '').trim() } : x)));
  }

  // Renuméroter suit l'ordre ENREGISTRÉ : une mise en forme en cours doit
  // d'abord s'enregistrer, sans quoi les codes suivraient un autre ordre.
  async function renumeroter() {
    const ordre = data.acquis.map(a => a.aa_code);
    const cibles = ordre.map((_, i) => `AA${ueNum}.${i + 1}`);
    const changes = ordre.map((c, i) => (c !== cibles[i] ? `${c} → ${cibles[i]}` : null)).filter(Boolean);
    if (!changes.length) { alert('La numérotation est déjà propre.'); return; }
    if (!window.confirm(`Renuméroter les acquis de l'UE ${ueNum} dans l'ordre enregistré ?\n\n${changes.join('\n')}\n\nLes codes sont réécrits partout : pondérations, notes, motivations, propositions.`)) return;
    const r = await envoyer(`/api/aa/ue/${ueNum}/renumeroter`, { ordre, recoder: true }, 'POST');
    if (r) await charger();
  }

  async function rattacher(aaCode, coursCode) {
    setEnCours(aaCode);
    try {
      const rep = await fetch(`/api/aa/${encodeURIComponent(aaCode)}`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ cours_code: coursCode || null }),
      });
      if (!rep.ok) { setErreur((await rep.json()).error || 'échec'); return; }
      await charger();
    } finally { setEnCours(null); }
  }

  if (erreur) return <div className="text-sm text-red-700 py-3">{erreur}</div>;
  if (!data) return <div className="text-sm text-gray-400 py-3">Chargement…</div>;

  if (!data.acquis.length) {
    return (
      <div className="text-sm text-gray-500 py-4 px-3 border border-dashed border-gray-200 rounded-lg">
        Aucun acquis d'apprentissage encodé pour cette UE.
        <div className="text-xs text-gray-400 mt-1">
          Ils sont extraits automatiquement lors de l'import du dossier pédagogique.
        </div>
      </div>
    );
  }

  // Le numéro affiché suit la liste en cours de mise en forme.
  let rang = 0;
  const numeros = {};
  for (const p of pieces) if (p.type === 'aa') numeros[p.code] = ++rang;

  const zoneLacher = (index) => peutCorriger && glisse != null && (
    <div onDragOver={e => { e.preventDefault(); setSurvol(index); }}
      onDragLeave={() => setSurvol(s => (s === index ? null : s))}
      onDrop={e => { e.preventDefault(); lacher(index); }}
      className={`h-2 -my-1 relative z-10 ${survol === index ? 'bg-iip-turquoise/40 rounded' : ''}`} />
  );

  const poignee = (i, id) => peutCorriger && (
    <div className="flex items-center flex-none -ml-1 mt-0.5">
      <span draggable onDragStart={e => { setGlisse(id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setGlisse(null); setSurvol(null); }}
        title="Glisser pour déplacer" aria-hidden="true"
        className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
        <IconGripVertical size={15} />
      </span>
      <span className="flex flex-col">
        <button onClick={() => deplacer(i, -1)} disabled={i === 0} aria-label="Monter"
          className="text-slate-300 hover:text-iip-blue disabled:opacity-20"><IconArrowUp size={11} /></button>
        <button onClick={() => deplacer(i, 1)} disabled={i === pieces.length - 1} aria-label="Descendre"
          className="text-slate-300 hover:text-iip-blue disabled:opacity-20"><IconArrowDown size={11} /></button>
      </span>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[12px] text-slate-500 flex-wrap">
        <IconTargetArrow size={15} className="text-iip-turquoise" />
        <span>{data.acquis.length} acquis</span>
        {data.non_rattaches > 0 && (
          <span className="flex items-center gap-1 text-amber-700 font-medium">
            <IconAlertTriangle size={13} /> {data.non_rattaches} non rattaché(s) à un cours
          </span>
        )}
        {peutCorriger && (
          <span className="ml-auto flex items-center gap-1.5">
            <button onClick={() => ajouterChapeau(0)} className="bouton"
              title="Une phrase qui introduit le groupe d'acquis qui la suit — glissez-la où il faut">
              <IconPlus size={13} /> Chapeau
            </button>
            <button onClick={renumeroter} disabled={modifie} className="bouton"
              title={modifie ? 'Enregistrez d’abord la mise en forme : les codes suivent l’ordre enregistré'
                : `Réécrire les codes AA${ueNum}.1, AA${ueNum}.2… dans l'ordre enregistré — partout où ils sont cités`}>
              <IconListNumbers size={13} /> Renuméroter
            </button>
          </span>
        )}
      </div>

      {/* Le document, tel que le dossier pédagogique le présente. */}
      <div className="rounded-carte border border-slate-200 px-3 py-3 space-y-1 bg-white">
        {/* 1. La phrase de l'unité */}
        {peutCorriger ? (
          <div>
            <textarea value={intro} rows={1}
              onChange={e => { setIntro(e.target.value); setModifie(true); setMessage(null); }}
              aria-label="Phrase qui introduit les acquis de l'unité"
              className="w-full text-[13px] font-semibold text-slate-800 border border-transparent hover:border-slate-200
                         focus:border-slate-300 rounded-champ px-1.5 py-1 resize-none focus:outline-none" />
            {data.introduction_proposee && !modifie && (
              <p className="text-[11px] text-slate-400 px-1.5 -mt-0.5">
                Proposée depuis le dossier pédagogique — elle s'enregistre avec la mise en forme.
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] font-semibold text-slate-800">{intro}</p>
        )}

        {/* 2 et 3. Les chapeaux et les acquis, dans l'ordre */}
        {pieces.map((p, i) => [
          <div key={`z${p.id}`}>{zoneLacher(i)}</div>,
          p.type === 'chapeau' ? (
            <div key={p.id}
              className={`flex items-start gap-2 pl-2 ${glisse === p.id ? 'opacity-40' : ''}`}>
              {poignee(i, p.id)}
              {peutCorriger ? (
                <input value={p.texte} onChange={e => ecrireChapeau(p.id, e.target.value)}
                  placeholder="face à… · en disposant de… · à partir de…"
                  aria-label="Chapeau"
                  className="flex-1 min-w-0 text-[13px] italic text-slate-600 border border-transparent hover:border-slate-200
                             focus:border-slate-300 rounded-champ px-1.5 py-0.5 focus:outline-none" />
              ) : (
                <p className="flex-1 text-[13px] italic text-slate-600">{p.texte}</p>
              )}
              {peutCorriger && (
                <button onClick={() => oterChapeau(p.id)} aria-label="Retirer ce chapeau"
                  className="text-slate-300 hover:text-red-600 flex-none mt-1"><IconX size={13} /></button>
              )}
            </div>
          ) : (() => {
            const a = parCode[p.code] || { aa_code: p.code };
            return (
              <div key={p.id}
                className={`flex items-start gap-2 pl-6 py-0.5 rounded-champ hover:bg-slate-50/70 ${glisse === p.id ? 'opacity-40' : ''}`}>
                {poignee(i, p.id)}
                <span className="text-[11px] text-slate-400 tabular-nums w-5 text-right flex-none mt-0.5">{numeros[p.code]}.</span>
                {edition?.code === a.aa_code ? (
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <input value={edition.nouveau_code} autoFocus aria-label="Code de l'acquis"
                      onChange={e => setEdition(x => ({ ...x, nouveau_code: e.target.value }))}
                      className="controle w-32" />
                    <textarea value={edition.description} rows={2} aria-label="Libellé de l'acquis"
                      onChange={e => setEdition(x => ({ ...x, description: e.target.value }))}
                      className="w-full text-[13px] border border-slate-300 rounded-champ px-2 py-1" />
                    <div className="flex gap-1.5">
                      <button onClick={enregistrerEdition} className="bouton bouton-fort"><IconCheck size={13} /> Enregistrer</button>
                      <button onClick={() => setEdition(null)} className="bouton"><IconX size={13} /> Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-slate-800 leading-snug flex items-start gap-1.5">
                      <span className="text-[11px] font-bold text-iip-blue bg-iip-blue/8 px-1.5 py-0.5 rounded flex-none">{a.aa_code}</span>
                      <span className="flex-1">{a.description}</span>
                      {peutCorriger && (
                        <>
                          <button onClick={() => setEdition({ code: a.aa_code, nouveau_code: a.aa_code, description: a.description || '' })}
                            title="Corriger le code ou le libellé" className="text-slate-300 hover:text-iip-blue flex-none">
                            <IconPencil size={14} /></button>
                          <button onClick={() => enChapeau(a)}
                            title="Ce n'est pas un acquis mais une phrase d'introduction : en faire un chapeau"
                            className="text-slate-300 hover:text-iip-blue flex-none text-[11px] font-semibold italic leading-none mt-0.5">
                            ¶</button>
                          <button onClick={() => supprimer(a)}
                            title="Supprimer cet acquis — s'il est déjà évalué, Lucie dit d'abord ce qui serait emporté"
                            className="text-slate-300 hover:text-red-600 flex-none">
                            <IconTrash size={14} /></button>
                        </>
                      )}
                    </div>
                    {!data.epreuve_integree && (
                      <div className="flex items-center gap-2 mt-1">
                        {a.cours_code
                          ? <IconLink size={13} className="text-emerald-600 flex-none" />
                          : <IconUnlink size={13} className="text-slate-300 flex-none" />}
                        <select value={a.cours_code || ''}
                          disabled={enCours === a.aa_code || !data.cours.length}
                          onChange={e => rattacher(a.aa_code, e.target.value)}
                          aria-label={`Cours de rattachement de ${a.aa_code}`}
                          className="text-[12px] border border-slate-200 rounded-champ px-2 py-0.5 max-w-[320px]">
                          <option value="">— non rattaché —</option>
                          {data.cours.map(c => (
                            <option key={c.cours_code} value={c.cours_code}>
                              {c.cours_code} · {c.cours_nom}{c.ct_pp ? ` (${c.ct_pp})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })(),
        ])}
        <div>{zoneLacher(pieces.length)}</div>
      </div>

      {peutCorriger && (modifie || message) && (
        <div className="flex items-center gap-2 flex-wrap">
          {modifie && (
            <>
              <button onClick={enregistrerForme} disabled={orphelin || !intro.trim()} className="bouton bouton-fort">
                <IconCheck size={13} /> Enregistrer la mise en forme
              </button>
              <button onClick={charger} className="bouton">Annuler</button>
            </>
          )}
          <span className={`text-[12px] min-w-0 ${orphelin || !intro.trim() ? 'text-[#9d4a38]' : 'text-slate-500'}`}>
            {!intro.trim() ? 'La phrase qui introduit les acquis ne peut pas rester vide.'
              : orphelin ? 'Un chapeau est placé après le dernier acquis : il n’introduit rien. Déplacez-le ou retirez-le.'
              : modifie ? 'La mise en forme n’est pas encore enregistrée. Les codes ne changent pas : « Renuméroter » s’en charge ensuite.'
              : message}
          </span>
        </div>
      )}

      {data.epreuve_integree && (
        <p className="text-[11px] text-violet-800 bg-violet-50 border border-violet-200 rounded px-2 py-1.5">
          Épreuve intégrée : les acquis ne se rattachent pas aux cours. Leur <b>pondération
          dans l'unité</b> se règle dans Délibération → « Paramétrer ».
        </p>
      )}
      {!data.cours.length && !data.epreuve_integree && (
        <p className="text-[11px] text-amber-700">
          Aucun cours n'est encodé pour cette UE : le rattachement sera possible une
          fois les cours créés.
        </p>
      )}
      {!peutCorriger && (
        <p className="text-[11px] text-slate-400">
          Le code, le libellé et la mise en forme des acquis proviennent du dossier pédagogique
          et ne sont modifiables que par la direction ; le rattachement à un cours reste ouvert.
        </p>
      )}
    </div>
  );
}
