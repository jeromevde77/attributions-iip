/* (CS) LE TABLEAU CROISÉ DES ATTRIBUTIONS (3.5.774, Charles, 28 novembre 2026 : « une autre vue d'attribution… un tableau
   croisé : en lignes l'UE, ses cours puis les activités ; en colonnes les profs ; une case à cocher ; si je décoche, le prof
   passe en à désigner » ; modèle C retenu, « quand je clique sur 2 cases, que cela propose couper ou dédoubler » ; « une
   version simplifiée et visuelle plutôt que linéaire »). DÉMO : une quatrième vue d'Attributions, sur les mêmes données et par
   les mêmes portes (`updateAttribution`, `createAttribution`) — mêmes droits, mêmes couleurs et mêmes codes de groupes.

   Une ligne = une ligne d'attribution (un groupe d'un cours, d'une activité, d'une organisation). Une colonne = un professeur
   de l'unité ; la première est « À désigner ». La case cochée dit qui porte la ligne, et ses périodes.
   • décocher la case du professeur → la ligne passe « À DÉSIGNER » ;
   • cocher une case sur une ligne à désigner → la ligne lui revient ;
   • cocher une case sur une ligne déjà portée par un autre → Remplacer · Couper (le même groupe, périodes partagées) ·
     Dédoubler (un groupe de plus, lettre suivante, mêmes périodes). */
import { useMemo, useState } from 'react';
import { IconCheck, IconPlus, IconScissors, IconCopy, IconArrowsExchange } from '@tabler/icons-react';
import { choisir, saisir, informer, demander } from '../lib/dialogue.jsx';

const estADesigner = p => !!p && (p.est_a_designer === 1 || /d[ée]signer/i.test(p.nom_prenom || p.nom || ''));
const nPer = r => Number(r.periodes_attribuees) || 0;
const nAut = r => Number(r.autonomie_attribuee) || 0;

export default function MatriceAttributions({ sectionGroups, professeurs, badge, groupCodeSeq, peutEcrire,
  changerProf, payloadCopie, api, recharger }) {
  const profADesigner = useMemo(() => professeurs.find(estADesigner) || null, [professeurs]);
  const profsParId = useMemo(() => new Map(professeurs.map(p => [p.id, p])), [professeurs]);
  const [ajoutes, setAjoutes] = useState({});   // clé d'UE → [id de prof ajoutés à la main]
  const [occupe, setOccupe] = useState(false);

  const libre = r => !r.professeur_id || (profADesigner && r.professeur_id === profADesigner.id) || estADesigner(profsParId.get(r.professeur_id));
  const nomCourt = p => {
    if (!p) return '?';
    const s = p.nom_prenom || `${p.nom || ''} ${p.prenom || ''}`;
    return s.trim();
  };

  async function agir(fn) {
    if (occupe) return;
    setOccupe(true);
    try { await fn(); await recharger(); }
    catch (e) { informer('Erreur : ' + (e.message || e)); }
    finally { setOccupe(false); }
  }

  /* Les codes déjà pris par les lignes sœurs (même section, cours, organisation, activité). */
  function lettreSuivante(row, toutes) {
    const soeurs = toutes.filter(r => r.section === row.section && r.code_cours === row.code_cours
      && (r.num_organisation || 1) === (row.num_organisation || 1) && (r.activite_id || null) === (row.activite_id || null));
    const prises = new Set(soeurs.map(r => String(r.code || '').toUpperCase()).filter(c => c && c !== 'TS'));
    const suite = groupCodeSeq(soeurs.length + prises.size + 3, row);
    return { suite, prises };
  }

  async function cliquerCase(row, prof, toutes) {
    if (!peutEcrire || row.en_conge) return;
    const porteur = row.professeur_id;
    // Décocher : la ligne passe à désigner.
    if (prof === 'designer' || (prof && prof.id === porteur && !libre(row))) {
      if (libre(row)) return;
      if (!profADesigner) { informer('La fiche « À DÉSIGNER » est introuvable.'); return; }
      return agir(() => changerProf(row.id, profADesigner.id));
    }
    // Ligne à désigner : elle revient au professeur cliqué.
    if (libre(row)) return agir(() => changerProf(row.id, prof.id));
    // Ligne portée par un autre : le choix.
    const autre = nomCourt(profsParId.get(porteur));
    const qui = nomCourt(prof);
    const code = String(row.code || '').toUpperCase();
    const groupe = code && code !== 'TS' ? `le groupe ${code}` : 'Ts';
    const geste = await choisir({
      titre: `${row.code_cours} · ${groupe}`,
      message: `Cette ligne (${nPer(row)} p.) est portée par ${autre}. Que faire pour ${qui} ?`,
      choix: [
        { valeur: 'remplacer', libelle: `Remplacer ${autre}`, aide: `${qui} reprend la ligne entière ; ${autre} n'y est plus.` },
        { valeur: 'couper', libelle: 'Couper', aide: `Les mêmes étudiants (${groupe}), les ${nPer(row)} périodes partagées entre ${autre} et ${qui}.` },
        { valeur: 'dedoubler', libelle: 'Dédoubler', aide: `Un groupe de plus : ${qui} reçoit un nouveau groupe, aux mêmes ${nPer(row)} périodes ; ${autre} garde le sien.` },
      ],
    });
    if (!geste) return;
    if (geste === 'remplacer') return agir(() => changerProf(row.id, prof.id));
    if (geste === 'couper') {
      const total = nPer(row);
      const s = await saisir({ message: `Combien de périodes pour ${qui} (sur ${total}) ? Le reste reste à ${autre}.`, valeur: String(Math.round(total / 2)) });
      if (s == null) return;
      const p = Math.max(0, Math.min(total, Number(String(s).replace(',', '.')) || 0));
      if (!p || p >= total) { informer(`Indiquez un nombre entre 1 et ${total - 1}.`); return; }
      return agir(async () => {
        await api.updateAttribution(row.id, { split_groupe: 'O', periodes_attribuees: total - p });
        await api.createAttribution({ ...payloadCopie(row, row.code || null, 'O'), professeur_id: prof.id, periodes_attribuees: p, autonomie_attribuee: 0 });
      });
    }
    if (geste === 'dedoubler') {
      const { suite, prises } = lettreSuivante(row, toutes);
      let codeSource = code && code !== 'TS' ? code : null;
      if (!codeSource) codeSource = suite.find(c => !prises.has(String(c).toUpperCase()));
      const prises2 = new Set([...prises, String(codeSource).toUpperCase()]);
      const nouveau = suite.find(c => !prises2.has(String(c).toUpperCase()));
      if (!nouveau) { informer('Plus de lettre de groupe disponible.'); return; }
      if (!(await demander(`${autre} garde le groupe ${codeSource} ; ${qui} reçoit le groupe ${nouveau}, ${nPer(row)} périodes.`))) return;
      return agir(async () => {
        if (codeSource !== code) await api.updateAttribution(row.id, { code: codeSource, split_groupe: 'N' });
        await api.createAttribution({ ...payloadCopie(row, nouveau, 'N'), professeur_id: prof.id });
      });
    }
  }

  const pastille = r => {
    const c = String(r.code || '').toUpperCase();
    const coupe = r.split_groupe === 'O';
    if (!c || c === 'TS') return <span className="inline-flex items-center justify-center min-w-[1.6rem] h-5 px-1 rounded text-mention font-bold border"
      style={{ background: 'rgb(var(--gris-50))', color: 'rgb(var(--gris-500))', borderColor: 'var(--c-filet)' }}>Ts{coupe ? '✂' : ''}</span>;
    const b = badge(c) || { bg: 'rgb(var(--gris-100))', color: 'var(--c-texte)', border: 'var(--c-filet)' };
    return <span className="inline-flex items-center justify-center min-w-[1.6rem] h-5 px-1 rounded text-mention font-bold border"
      style={{ background: b.bg, color: b.color, borderColor: b.border }}>{c}{coupe ? '✂' : ''}</span>;
  };

  function tableUE(sec, ue) {
    const cle = `${sec}/${ue.ue_num}/${ue.num_organisation || 1}`;
    const rows = ue.rows;
    const ids = new Set();
    for (const r of rows) if (r.professeur_id && !libre(r)) ids.add(r.professeur_id);
    for (const id of (ajoutes[cle] || [])) ids.add(id);
    const cols = [...ids].map(id => profsParId.get(id) || { id, nom_prenom: `#${id}` })
      .sort((a, b) => nomCourt(a).localeCompare(nomCourt(b), 'fr'));
    const total = (pred) => rows.filter(r => !r.en_conge && pred(r)).reduce((s, r) => s + nPer(r), 0);
    const dispo = professeurs.filter(p => !estADesigner(p) && !ids.has(p.id));

    const caseDe = (r, prof) => {
      const coche = prof === 'designer' ? libre(r) : (!libre(r) && r.professeur_id === prof.id);
      const titre = prof === 'designer' ? 'À désigner' : nomCourt(prof);
      return (
        <td key={prof === 'designer' ? 'd' : prof.id} className="cellule text-center px-1"
          style={prof === 'designer' ? { background: 'color-mix(in srgb, var(--c-attente) 6%, transparent)' } : undefined}>
          <button type="button" disabled={!peutEcrire || r.en_conge || occupe}
            title={coche ? `${titre} · ${nPer(r)} p.${nAut(r) ? ` + ${nAut(r)} a.` : ''}` : (peutEcrire ? `Donner à ${titre}` : '')}
            onClick={() => cliquerCase(r, prof, rows)}
            className={`inline-flex items-center justify-center gap-0.5 min-w-[2.6rem] h-7 rounded-champ border text-second tabular-nums transition
              ${coche ? 'font-semibold text-white' : 'border-dashed text-transparent hover:text-slate-400'}
              ${peutEcrire && !r.en_conge ? 'cursor-pointer' : 'cursor-default'}`}
            style={coche
              ? { background: prof === 'designer' ? 'var(--c-attente)' : 'var(--c-principal, #16406A)', borderColor: 'transparent' }
              : { borderColor: 'var(--c-filet, rgb(var(--gris-200)))' }}>
            {coche ? <>{nPer(r)}{nAut(r) ? <span className="opacity-80 font-normal">+{nAut(r)}</span> : null}</> : <IconCheck size={13} />}
          </button>
        </td>);
    };

    // L'arbre : cours → activité → lignes.
    const lignes = [];
    for (const c of ue.cours) {
      lignes.push(
        <tr key={`c-${c.code_cours}`} className="tab-repere">
          <td className="cellule pl-4 pr-3 font-semibold whitespace-nowrap" colSpan={1}>
            {c.code_cours} <span className="font-normal text-slate-600">{c.nom_cours}</span>
          </td>
          <td className="cellule text-center text-second tabular-nums" style={{ background: 'color-mix(in srgb, var(--c-attente) 6%, transparent)' }}>
            {total(r => r.code_cours === c.code_cours && libre(r)) || ''}</td>
          {cols.map(p => <td key={p.id} className="cellule text-center text-second tabular-nums">
            {total(r => r.code_cours === c.code_cours && !libre(r) && r.professeur_id === p.id) || ''}</td>)}
          <td className="cellule" />
        </tr>);
      const parAct = new Map();
      for (const r of c.rows) {
        const k = r.activite_id || 0;
        if (!parAct.has(k)) parAct.set(k, { nom: r.activite_nom || '', rows: [] });
        parAct.get(k).rows.push(r);
      }
      const plusieurs = parAct.size > 1 || [...parAct.values()].some(a => a.nom);
      for (const [k, a] of parAct) {
        if (plusieurs) lignes.push(
          <tr key={`a-${c.code_cours}-${k}`} className="ligne-maison">
            <td className="cellule pl-8 pr-3 text-second text-slate-600 italic whitespace-nowrap" colSpan={cols.length + 3}>{a.nom || 'sans activité'}</td>
          </tr>);
        const tri = [...a.rows].sort((x, y) => String(x.code || 'zz').localeCompare(String(y.code || 'zz'), 'fr', { numeric: true }));
        for (const r of tri) lignes.push(
          <tr key={r.id} className={`ligne-maison ${r.en_conge ? 'opacity-50' : ''}`}>
            <td className={`cellule ${plusieurs ? 'pl-12' : 'pl-8'} pr-3 whitespace-nowrap`}>
              <span className="inline-flex items-center gap-2">{pastille(r)}
                <span className="text-second text-slate-500 tabular-nums">{nPer(r)} p.</span>
                {r.en_conge ? <span className="text-mention text-slate-500">congé</span> : null}</span>
            </td>
            {caseDe(r, 'designer')}
            {cols.map(p => caseDe(r, p))}
            <td className="cellule" />
          </tr>);
      }
    }

    return (
      <div key={cle} className="mb-5">
        <div className="flex items-baseline gap-2 mb-1.5 px-1">
          <span className="titre-carte">UE {ue.ue_num}</span>
          <span className="text-slate-600 truncate">{ue.ue_nom}</span>
          {(ue.num_organisation || 1) > 1 || ue.rows.some(r => (r.num_organisation || 1) > 1)
            ? <span className="text-second text-slate-500">· organisation {ue.num_organisation || 1}</span> : null}
          {ue.bloc ? <span className="text-second text-slate-500">· {ue.bloc}</span> : null}
        </div>
        <div className="tableau-cadre border rounded-xl overflow-x-auto" style={{ borderColor: 'var(--c-filet, rgb(var(--gris-200)))' }}>
          <table className="tableau-maison text-sm" data-numeros="non">
            <thead>
              <tr className="tab-entete">
                <th className="cellule px-3 text-left font-medium min-w-[16rem]">Cours · groupe</th>
                <th className="cellule px-2 text-center font-medium whitespace-nowrap" style={{ color: 'var(--c-attente)' }}>À désigner</th>
                {cols.map(p => <th key={p.id} className="cellule px-2 text-center font-medium whitespace-nowrap max-w-[9rem]">
                  <span className="block truncate" title={nomCourt(p)}>{nomCourt(p)}</span></th>)}
                <th className="cellule px-2 text-left font-medium">
                  {peutEcrire && dispo.length > 0 && (
                    <select value="" className="text-second cursor-pointer max-w-[10rem]" title="Ajouter un professeur en colonne"
                      onChange={e => { const id = Number(e.target.value); if (id) setAjoutes(s => ({ ...s, [cle]: [...(s[cle] || []), id] })); }}>
                      <option value="">+ Ajouter…</option>
                      {dispo.map(p => <option key={p.id} value={p.id}>{nomCourt(p)}</option>)}
                    </select>)}
                </th>
              </tr>
              <tr className="ligne-total font-semibold">
                <td className="cellule px-3 text-second">Total de l'unité</td>
                <td className="cellule text-center tabular-nums" style={{ color: 'var(--c-attente)' }}>{total(libre) || ''}</td>
                {cols.map(p => <td key={p.id} className="cellule text-center tabular-nums">{total(r => !libre(r) && r.professeur_id === p.id) || ''}</td>)}
                <td className="cellule" />
              </tr>
            </thead>
            <tbody>{lignes}</tbody>
          </table>
        </div>
      </div>);
  }

  return (
    <div className="space-y-6">
      <div className="bloc-etat px-4 py-2.5 text-second text-slate-700" data-etat="disponible">
        <b>Tableau croisé — démonstration.</b> Une colonne par professeur de l'unité, une ligne par groupe. Décocher une case
        rend la ligne « à désigner » ; cocher la case d'un autre professeur propose de <b>remplacer</b>, de <b>couper</b> (mêmes
        étudiants, périodes partagées) ou de <b>dédoubler</b> (un groupe de plus).
        <span className="inline-flex items-center gap-3 ml-2 text-slate-500"><IconArrowsExchange size={14} /><IconScissors size={14} /><IconCopy size={14} /><IconPlus size={14} /></span>
      </div>
      {sectionGroups.map(sg => (
        <section key={sg.section}>
          <h2 className="intertitre mb-2">{sg.section}</h2>
          {sg.ues.map(ue => tableUE(sg.section, ue))}
        </section>
      ))}
    </div>
  );
}
