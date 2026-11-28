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
     Dédoubler (un groupe de plus, lettre suivante, mêmes périodes).
   3.5.775 (Charles : « aux intersections, pas de nombres, juste des cases ; au survol les valeurs ; la structure visible ; par UE,
   le numéro ou le nom au-dessus ; le nom des profs en vertical ») : une UE à la fois, l'arbre relié d'Attributions
   (`celluleArbre`), des colonnes étroites et égales, les noms à la verticale. */
import { useMemo, useState } from 'react';
import { IconCheck, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { choisir, saisir, informer, demander } from '../lib/dialogue.jsx';

const estADesigner = p => !!p && (p.est_a_designer === 1 || /d[ée]signer/i.test(p.nom_prenom || p.nom || ''));
const nPer = r => Number(r.periodes_attribuees) || 0;
const nAut = r => Number(r.autonomie_attribuee) || 0;

export default function MatriceAttributions({ sectionGroups, professeurs, badge, groupCodeSeq, peutEcrire,
  changerProf, payloadCopie, api, recharger, celluleArbre }) {
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

  /* L'UE CHOISIE : par son numéro ou son nom, dans un champ au-dessus (Charles : « par UE, on entre le numéro ou le nom »). */
  const toutesUE = useMemo(() => {
    const m = new Map();
    for (const sg of sectionGroups) for (const u of sg.ues) if (u.ue_num != null && !m.has(u.ue_num)) m.set(u.ue_num, u.ue_nom || '');
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [sectionGroups]);
  const [saisie, setSaisie] = useState(() => { try { return localStorage.getItem('lucie.matrice.ue') || ''; } catch { return ''; } });
  const ueChoisie = useMemo(() => {
    const t = saisie.trim().toLowerCase();
    if (!t) return null;
    const num = Number((t.match(/^\d+/) || [])[0]);
    if (num && toutesUE.some(([n]) => n === num)) return num;
    const parNom = toutesUE.filter(([, nom]) => nom.toLowerCase().includes(t));
    return parNom.length === 1 ? parNom[0][0] : null;
  }, [saisie, toutesUE]);
  const choisirUE = v => { setSaisie(v); try { localStorage.setItem('lucie.matrice.ue', v); } catch { /* rien */ } };
  const [replies, setReplies] = useState(new Set());

  const LARGEUR_COL = 34;
  const tdCase = { width: LARGEUR_COL, minWidth: LARGEUR_COL, maxWidth: LARGEUR_COL, padding: 0 };

  function tableUE(sec, ues) {
    const cle = `${sec}/${ues[0].ue_num}`;
    const rows = ues.flatMap(u => u.rows);
    const ids = new Set();
    for (const r of rows) if (r.professeur_id && !libre(r)) ids.add(r.professeur_id);
    for (const id of (ajoutes[cle] || [])) ids.add(id);
    const cols = [...ids].map(id => profsParId.get(id) || { id, nom_prenom: `#${id}` })
      .sort((a, b) => nomCourt(a).localeCompare(nomCourt(b), 'fr'));
    const somme = (lst, pred) => lst.filter(r => !r.en_conge && pred(r)).reduce((s, r) => s + nPer(r), 0);
    const dispo = professeurs.filter(p => !estADesigner(p) && !ids.has(p.id));
    const plusieursOrgs = ues.length > 1;

    const caseDe = (r, prof) => {
      const designer = prof === 'designer';
      const coche = designer ? libre(r) : (!libre(r) && r.professeur_id === prof.id);
      const nom = designer ? 'À désigner' : nomCourt(prof);
      const code = String(r.code || '').toUpperCase();
      const groupe = code && code !== 'TS' ? `groupe ${code}` : 'Ts';
      const valeurs = `${r.code_cours} · ${groupe}${r.activite_nom ? ' · ' + r.activite_nom : ''} — ${nPer(r)} p.${nAut(r) ? ` + ${nAut(r)} a. d'autonomie` : ''}`;
      const titre = coche ? `${nom}\n${valeurs}` : (peutEcrire && !r.en_conge ? `${designer ? 'Mettre à désigner' : 'Donner à ' + nom}\n${valeurs}` : valeurs);
      const fond = designer ? 'var(--c-attente)' : 'var(--c-principal, #16406A)';
      return (
        <td key={designer ? 'd' : prof.id} className="text-center align-middle" style={{ ...tdCase,
          background: designer ? 'color-mix(in srgb, var(--c-attente) 6%, transparent)' : undefined,
          borderLeft: '1px solid var(--c-filet, rgb(var(--gris-200)))' }}>
          <button type="button" disabled={!peutEcrire || r.en_conge || occupe} title={titre}
            onClick={() => cliquerCase(r, prof, rows)}
            className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded border align-middle
              ${peutEcrire && !r.en_conge ? 'cursor-pointer hover:ring-2 hover:ring-[color:var(--c-principal)]/25' : 'cursor-default'}`}
            style={coche ? { background: fond, borderColor: fond, color: '#fff' }
              : { background: 'var(--blanc, #fff)', borderColor: 'rgb(var(--gris-300))' }}>
            {coche ? <IconCheck size={13} stroke={3} /> : null}
          </button>
        </td>);
    };
    const casesVides = (cle2) => [<td key={cle2 + 'd'} style={{ ...tdCase, background: 'color-mix(in srgb, var(--c-attente) 6%, transparent)', borderLeft: '1px solid var(--c-filet, rgb(var(--gris-200)))' }} />,
      ...cols.map(p => <td key={cle2 + p.id} style={{ ...tdCase, borderLeft: '1px solid var(--c-filet, rgb(var(--gris-200)))' }} />), <td key={cle2 + 'f'} />];

    // L'arbre : (organisation) → cours → activité → groupes, relié comme dans Attributions.
    const lignes = [];
    ues.forEach((ue, iu) => {
      const base = plusieursOrgs ? 1 : 0;
      const suitesOrg = plusieursOrgs ? [iu < ues.length - 1] : [];
      if (plusieursOrgs) lignes.push(
        <tr key={`o-${iu}`} className="ligne-maison" style={{ height: 34 }}>
          {celluleArbre({ niveau: 1, suites: [], dernier: iu === ues.length - 1, enfants: ue.cours.length > 0,
            children: <span className="font-semibold">Organisation {ue.num_organisation || 1}{ue.bloc ? <span className="font-normal text-slate-500"> · {ue.bloc}</span> : null}</span> })}
          {casesVides('o' + iu)}
        </tr>);
      ue.cours.forEach((c, ic) => {
        const kc = `${ue.num_organisation}/${c.code_cours}`;
        const ferme = replies.has(kc);
        const dernierC = ic === ue.cours.length - 1;
        const parAct = new Map();
        for (const r of c.rows) {
          const k = r.activite_id || 0;
          if (!parAct.has(k)) parAct.set(k, { nom: r.activite_nom || '', rows: [] });
          parAct.get(k).rows.push(r);
        }
        const acts = [...parAct.values()];
        const avecActs = acts.length > 1 || acts.some(a => a.nom);
        lignes.push(
          <tr key={`c-${kc}`} className="ligne-maison" style={{ height: 34 }}>
            {celluleArbre({ niveau: base + 1, suites: suitesOrg, dernier: dernierC, enfants: !ferme && c.rows.length > 0,
              title: `${c.code_cours} ${c.nom_cours || ''} — ${somme(c.rows, () => true)} p. attribuées`,
              children: <>
                <button type="button" onClick={() => setReplies(s => { const n = new Set(s); n.has(kc) ? n.delete(kc) : n.add(kc); return n; })}
                  className="text-slate-500 hover:text-slate-800 flex-none">{ferme ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}</button>
                <span className="font-mono text-slate-600 flex-none">{c.code_cours}</span>
                <span className="font-semibold truncate">{c.nom_cours}</span></> })}
            {casesVides('c' + kc)}
          </tr>);
        if (ferme) return;
        const suitesC = [...suitesOrg, !dernierC];
        acts.forEach((a, ia) => {
          const dernierA = ia === acts.length - 1;
          let niveauG = base + 2, suitesG = suitesC;
          if (avecActs) {
            lignes.push(
              <tr key={`a-${kc}-${ia}`} className="ligne-maison" style={{ height: 30 }}>
                {celluleArbre({ niveau: base + 2, suites: suitesC, dernier: dernierA, enfants: a.rows.length > 0,
                  children: <span className="text-second text-slate-600 italic truncate">{a.nom || 'sans activité'}</span> })}
                {casesVides('a' + kc + ia)}
              </tr>);
            niveauG = base + 3; suitesG = [...suitesC, !dernierA];
          }
          const tri = [...a.rows].sort((x, y) => String(x.code || 'zz').localeCompare(String(y.code || 'zz'), 'fr', { numeric: true }));
          tri.forEach((r, ir) => lignes.push(
            <tr key={r.id} className={`ligne-maison ${r.en_conge ? 'opacity-50' : ''}`} style={{ height: 32 }}>
              {celluleArbre({ niveau: niveauG, suites: suitesG, dernier: ir === tri.length - 1,
                title: `${nPer(r)} p.${nAut(r) ? ` + ${nAut(r)} a.` : ''}${r.en_conge ? ' · en congé' : ''}`,
                children: <>{pastille(r)}{r.en_conge ? <span className="text-mention text-slate-500">congé</span> : null}</> })}
              {caseDe(r, 'designer')}
              {cols.map(p => caseDe(r, p))}
              <td />
            </tr>));
        });
      });
    });

    const entete = (texte, titre, couleur) => (
      <th className="align-bottom font-medium" title={titre}
        style={{ ...tdCase, padding: '6px 0', borderLeft: '1px solid var(--c-filet, rgb(var(--gris-200)))', color: couleur }}>
        <span className="inline-block whitespace-nowrap text-second" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>{texte}</span>
      </th>);

    return (
      <div key={cle} className="mb-6">
        <div className="text-second text-slate-500 mb-1 px-1">{sec}</div>
        <div className="tableau-cadre border rounded-xl overflow-x-auto" style={{ borderColor: 'var(--c-filet, rgb(var(--gris-200)))' }}>
          <table className="tableau-maison text-sm" data-numeros="non" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="tab-entete">
                <th className="text-left align-bottom px-3 py-2 font-medium" style={{ width: 300, minWidth: 300 }}>
                  <div className="titre-carte">UE {ues[0].ue_num}</div>
                  <div className="font-normal text-slate-600 truncate" style={{ maxWidth: 280 }}>{ues[0].ue_nom}</div>
                </th>
                {entete('À désigner', 'Lignes encore à désigner', 'var(--c-attente)')}
                {cols.map(p => entete(nomCourt(p), `${nomCourt(p)} — ${somme(rows, r => !libre(r) && r.professeur_id === p.id)} p. dans l'unité`))}
                <th className="align-bottom px-2 py-2 text-left font-medium">
                  {peutEcrire && dispo.length > 0 && (
                    <select value="" className="text-second cursor-pointer max-w-[10rem]" title="Ajouter un professeur en colonne"
                      onChange={e => { const id = Number(e.target.value); if (id) setAjoutes(s => ({ ...s, [cle]: [...(s[cle] || []), id] })); }}>
                      <option value="">+ Ajouter…</option>
                      {dispo.map(p => <option key={p.id} value={p.id}>{nomCourt(p)}</option>)}
                    </select>)}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="ligne-maison" style={{ height: 34 }}>
                {celluleArbre({ niveau: 0, enfants: true, children: <span className="font-semibold">UE {ues[0].ue_num}</span> })}
                {casesVides('ue')}
              </tr>
              {lignes}
            </tbody>
          </table>
        </div>
      </div>);
  }

  const sections = ueChoisie == null ? [] : sectionGroups
    .map(sg => ({ section: sg.section, ues: sg.ues.filter(u => u.ue_num === ueChoisie) }))
    .filter(sg => sg.ues.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-nowrap">
        <label className="flex items-center gap-2 text-sm font-medium flex-none">Unité
          <input list="matrice-ues" value={saisie} onChange={e => choisirUE(e.target.value)} placeholder="numéro ou nom de l'UE"
            className="controle w-72" autoFocus />
        </label>
        <datalist id="matrice-ues">{toutesUE.map(([n, nom]) => <option key={n} value={String(n)}>{nom}</option>)}</datalist>
        <span className="text-second text-slate-500 truncate">
          Tableau croisé — démonstration. Une case cochée dit qui porte le groupe ; les valeurs se lisent au survol.
          Décocher = à désigner ; cocher la case d'un autre = remplacer, couper ou dédoubler.</span>
      </div>
      {ueChoisie == null
        ? <div className="carte p-8 text-center text-slate-500">{saisie.trim() ? 'Aucune unité ne correspond (ou plusieurs) : précisez le numéro.' : 'Entrez le numéro ou le nom d\'une unité.'}</div>
        : sections.map(sg => tableUE(sg.section, sg.ues))}
    </div>
  );
}
