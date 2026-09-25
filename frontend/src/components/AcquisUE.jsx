import { useEffect, useState } from 'react';
import { IconTargetArrow, IconLink, IconUnlink, IconAlertTriangle, IconPencil,
         IconArrowUp, IconArrowDown, IconListNumbers, IconCheck, IconX, IconTrash } from '@tabler/icons-react';
import { authHeaders, getUser } from '../lib/api.js';
import { chargerChapeaux } from '../lib/chapeaux.js';

/**
 * Acquis d'apprentissage d'une UE.
 *
 * Les libellés proviennent du dossier pédagogique approuvé par la FWB : ils
 * relèvent du référentiel légal et ne sont modifiables que par l'administrateur.
 * Le rattachement d'un acquis à un cours de l'UE est en revanche du travail
 * pédagogique courant, ouvert aux éditeurs.
 */
export default function AcquisUE({ ueNum, annee, estAdmin }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [edition, setEdition] = useState(null);   // { code, nouveau_code, description, chapeau }
  // Le référentiel se corrige par la direction : un import maladroit du
  // dossier pédagogique doit pouvoir se réparer dans la maison.
  const peutCorriger = estAdmin || ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role);

  async function envoyer(url, corps, method = 'PATCH') {
    setErreur(null);
    const rep = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(corps) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { alert(j.error || `Refusé (${rep.status})`); return null; }
    return j;
  }

  async function enregistrerEdition() {
    const { code, nouveau_code, description, chapeau } = edition;
    const corps = {};
    if (nouveau_code.trim() && nouveau_code.trim() !== code) corps.nouveau_code = nouveau_code.trim();
    const ligne = data.acquis.find(a => a.aa_code === code) || {};
    const avant = ligne.description || '';
    if (description.trim() && description.trim() !== avant) corps.description = description.trim();
    // Un chapeau vidé s'efface : l'acquis rejoint le groupe qui le précède.
    if ((chapeau || '').trim() !== (ligne.chapeau || '').trim()) corps.chapeau = (chapeau || '').trim();
    if (!Object.keys(corps).length) { setEdition(null); return; }
    if (corps.nouveau_code && !window.confirm(`Renommer ${code} en ${corps.nouveau_code} ?\n\nLe nouveau code sera repris partout : pondérations, notes, motivations, propositions des professeurs.`)) return;
    const j = await envoyer(`/api/aa/${encodeURIComponent(code)}`, corps);
    if (j) { setEdition(null); chargerChapeaux(ueNum, true); await charger(); }
  }

  /* L'ORDRE, PUIS LA NUMÉROTATION. Déplacer un acquis réordonne sans toucher
     aux codes ; « Renuméroter » réécrit ensuite les codes AA{ue}.1…n dans cet
     ordre, partout où ils sont cités. */
  async function deplacer(i, sens) {
    const ordre = data.acquis.map(a => a.aa_code);
    const j = i + sens;
    if (j < 0 || j >= ordre.length) return;
    [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
    const r = await envoyer(`/api/aa/ue/${ueNum}/renumeroter`, { ordre, recoder: false }, 'POST');
    if (r) await charger();
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

  async function renumeroter() {
    const ordre = data.acquis.map(a => a.aa_code);
    const cibles = ordre.map((_, i) => `AA${ueNum}.${i + 1}`);
    const changes = ordre.map((c, i) => (c !== cibles[i] ? `${c} → ${cibles[i]}` : null)).filter(Boolean);
    if (!changes.length) { alert('La numérotation est déjà propre.'); return; }
    if (!window.confirm(`Renuméroter les acquis de l'UE ${ueNum} dans l'ordre affiché ?\n\n${changes.join('\n')}\n\nLes codes sont réécrits partout : pondérations, notes, motivations, propositions.`)) return;
    const r = await envoyer(`/api/aa/ue/${ueNum}/renumeroter`, { ordre, recoder: true }, 'POST');
    if (r) await charger();
  }

  async function charger() {
    try {
      const p = annee ? `?annee=${encodeURIComponent(annee)}` : '';
      const rep = await fetch(`/api/aa/ue/${ueNum}${p}`, { headers: authHeaders() });
      if (!rep.ok) throw new Error('chargement impossible');
      setData(await rep.json());
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { if (ueNum) charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <IconTargetArrow size={15} className="text-iip-turquoise" />
        <span>{data.acquis.length} acquis</span>
        {peutCorriger && (
          <button onClick={renumeroter}
            title={`Réécrire les codes AA${ueNum}.1, AA${ueNum}.2… dans l'ordre affiché — partout où ils sont cités`}
            className="ml-auto flex items-center gap-1 text-[12px] text-iip-blue border border-slate-300
                       rounded px-2 py-0.5 hover:border-iip-blue bg-white">
            <IconListNumbers size={13} /> Renuméroter
          </button>
        )}
        {data.non_rattaches > 0 && (
          <span className="flex items-center gap-1 text-amber-700 font-medium">
            <IconAlertTriangle size={13} /> {data.non_rattaches} non rattaché(s) à un cours
          </span>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {data.acquis.map((a, i) => [
          /* LE CHAPEAU OUVRE SON GROUPE : il se lit au-dessus du premier
             acquis qu'il introduit, et vaut pour les suivants jusqu'au
             prochain — comme dans le dossier pédagogique. */
          a.chapeau && edition?.code !== a.aa_code && (
            <div key={`${a.aa_code}|ch`}
              className="px-3 pt-2.5 pb-1 text-[12px] italic text-slate-600 leading-snug tab-repere">
              {a.chapeau}
            </div>
          ),
          <div key={a.aa_code} className="px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50/60">
            {peutCorriger && (
              <div className="flex flex-col flex-none -my-0.5">
                <button onClick={() => deplacer(i, -1)} disabled={i === 0} title="Monter"
                  className="text-slate-400 hover:text-iip-blue disabled:opacity-20"><IconArrowUp size={13} /></button>
                <button onClick={() => deplacer(i, 1)} disabled={i === data.acquis.length - 1} title="Descendre"
                  className="text-slate-400 hover:text-iip-blue disabled:opacity-20"><IconArrowDown size={13} /></button>
              </div>
            )}
            {edition?.code === a.aa_code ? (
              <input value={edition.nouveau_code} autoFocus
                onChange={e => setEdition(x => ({ ...x, nouveau_code: e.target.value }))}
                className="text-[11px] font-bold text-iip-blue border border-iip-blue rounded px-1.5 py-0.5 w-24 flex-none" />
            ) : (
              <span className="text-[11px] font-bold text-iip-blue bg-iip-blue/8 px-1.5 py-0.5 rounded flex-none mt-0.5">
                {a.aa_code}
              </span>
            )}
            <div className="flex-1 min-w-0">
              {edition?.code === a.aa_code ? (
                <div className="space-y-1.5">
                  <label className="block text-[11px] text-slate-500">
                    Chapeau — le contexte qui ouvre un groupe à partir de cet acquis
                    (facultatif ; vide, l'acquis suit le groupe précédent)
                    <textarea value={edition.chapeau} rows={2}
                      placeholder="ex. : Face à une situation clinique simulée, en disposant de la documentation, de :"
                      onChange={e => setEdition(x => ({ ...x, chapeau: e.target.value }))}
                      className="mt-0.5 w-full text-[12px] italic border border-slate-300 rounded px-2 py-1" />
                  </label>
                  <textarea value={edition.description} rows={2}
                    onChange={e => setEdition(x => ({ ...x, description: e.target.value }))}
                    className="w-full text-[13px] border border-slate-300 rounded px-2 py-1" />
                  <div className="flex gap-1.5">
                    <button onClick={enregistrerEdition}
                      className="flex items-center gap-1 text-[12px] font-semibold text-white bg-iip-blue rounded px-2 py-0.5">
                      <IconCheck size={13} /> Enregistrer</button>
                    <button onClick={() => setEdition(null)}
                      className="flex items-center gap-1 text-[12px] text-slate-600 border border-slate-300 rounded px-2 py-0.5">
                      <IconX size={13} /> Annuler</button>
                  </div>
                </div>
              ) : (
                <div className="text-[13px] text-gray-800 leading-snug flex items-start gap-1.5">
                  <span className="flex-1">{a.description}</span>
                  {peutCorriger && (
                    <>
                      <button onClick={() => setEdition({ code: a.aa_code, nouveau_code: a.aa_code, description: a.description || '',
                                                      chapeau: a.chapeau || '' })}
                        title="Corriger le code, le libellé ou le chapeau" className="text-slate-300 hover:text-iip-blue flex-none">
                        <IconPencil size={14} /></button>
                      <button onClick={() => supprimer(a)}
                        title="Supprimer cet acquis — s'il est déjà évalué, Lucie dit d'abord ce qui serait emporté"
                        className="text-slate-300 hover:text-red-600 flex-none">
                        <IconTrash size={14} /></button>
                    </>
                  )}
                </div>
              )}
              {data.epreuve_integree ? null : (
              <div className="flex items-center gap-2 mt-1.5">
                {a.cours_code
                  ? <IconLink size={13} className="text-emerald-600 flex-none" />
                  : <IconUnlink size={13} className="text-gray-300 flex-none" />}
                <select
                  value={a.cours_code || ''}
                  disabled={enCours === a.aa_code || !data.cours.length}
                  onChange={e => rattacher(a.aa_code, e.target.value)}
                  className="text-[12px] border border-gray-300 rounded px-2 py-1 max-w-[320px] bg-white">
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
          </div>,
        ])}
      </div>

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
        <p className="text-[11px] text-gray-400">
          Le code et le libellé des acquis proviennent du dossier pédagogique et ne sont
          modifiables que par la direction ; le rattachement à un cours reste ouvert.
        </p>
      )}
    </div>
  );
}
