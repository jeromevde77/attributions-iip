import { useState, useEffect } from 'react';
import { nomDoc } from '../lib/api.js';

// Catégorie EPROM selon ct_pp
const CAT_EPROM = {
  'CT': 'CTni', 'PP': 'PPms', 'Auto': 'Auto',
  'CTni': 'CTni', 'CTms': 'CTms', 'PPni': 'PPni', 'PPms': 'PPms',
};

function catCours(c) {
  if (c.cours_nom?.toUpperCase().includes('AUTONOMIE') || c.ct_pp === null) return 'Auto';
  return c.ct_pp === 'CT' ? 'CTni' : 'PPms';
}

function catEpt(code) {
  const cats = { '91':'SEtu','92':'SEtu','93':'SEtu','94':'SEtu','95':'ExPT','96':'SEtu','97':'PeSu','98':'PSup','99':'CEtu' };
  return cats[code] || code;
}

function fmtDate(d) { return d || '—'; }

function entete(etab, ue, org, num_org, annee) {
  const orgStr = org ? `N° Organisation : ${num_org} du ${fmtDate(org.date_debut)} au ${fmtDate(org.date_fin)}` : `N° Organisation : ${num_org}`;
  return `
    <div style="background:#e8f4f8;border:1px solid #6db3c8;border-radius:4px;padding:8px 12px;margin-bottom:10px;font-size:10px">
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div><b>Année scolaire :</b> ${annee}</div>
        <div><b>Etab :</b> ${etab.num_etab||'292'} - ${etab.num_ecot||'2132070'} - ${etab.etab_nom||'INSTITUT ILYA PRIGOGINE'}</div>
        <div><b>Impl :</b> ${etab.num_impl||'477'} - 0 - ${etab.adresse_impl||etab.adresse||'Route de Lennik 808 A ANDERLECHT'}</div>
      </div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:4px">
        <div><b>Formation :</b> ${ue.ue_num} - ${(ue.ue_nom||'').toUpperCase()}</div>
        <div><b>Code :</b> ${ue.ue_code_fwb||'—'}</div>
        <div><b>Date AS définitive :</b> ${ue.date_as||'—'}</div>
        <div>${orgStr}</div>
      </div>
    </div>`;
}

function genDoc2Html(d, annee) {
  const { etab, ue, org, num_organisation, cours, lignes_ept, tot_prevu, tot_reel } = d;
  const TH = 'background:#5a9eb0;color:white;padding:4px 8px;font-size:10px;font-weight:bold;text-align:left;border:1px solid #4a8ea0';
  const TD = 'padding:3px 8px;font-size:10px;border:1px solid #ccc';
  const TDR = TD + ';text-align:right';

  // Tableau activités
  let lignesAct = '';
  cours.forEach(c => {
    lignesAct += `<tr>
      <td style="${TD}">${c.num_activite}</td>
      <td style="${TD}">${catCours(c)}</td>
      <td style="${TD}">${(c.cours_nom||'').toUpperCase()}</td>
      <td style="${TDR}">1</td>
      <td style="${TDR}"></td>
      <td style="${TDR}">${c.cours_per||0}</td>
      <td style="${TDR}">${c.cours_per||0}</td>
      <td style="${TDR}">${c.per_reelles||0}</td>
      <td style="${TDR}"></td>
    </tr>`;
  });
  // Lignes 91-99
  lignes_ept.forEach(l => {
    lignesAct += `<tr>
      <td style="${TD}">${l.code_ept}</td>
      <td style="${TD}">${catEpt(l.code_ept)}</td>
      <td style="${TD}">${(l.libelle_ept||'').toUpperCase()}</td>
      <td style="${TDR}">1</td>
      <td style="${TDR}"></td>
      <td style="${TDR}"></td>
      <td style="${TDR}"></td>
      <td style="${TDR}"></td>
      <td style="${TDR}"></td>
    </tr>`;
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;padding:10mm}
    table{border-collapse:collapse;width:100%}
    @media print{@page{size:A4 landscape;margin:8mm}}</style>
    </head><body>
    <div style="font-weight:bold;font-size:12px;margin-bottom:6px">Document 2 — Déclaration de la dotation</div>
    ${entete(etab, ue, org, num_organisation, annee)}

    <!-- Tableau populations (vide — à compléter manuellement) -->
    <div style="font-weight:bold;font-size:10px;background:#c8dde6;padding:4px 8px;border:1px solid #6db3c8;margin-bottom:2px">
      POPULATION SCOLAIRE PAR ANNÉE D'ÉTUDES, AU 1/10EME
    </div>
    <table style="margin-bottom:10px">
      <thead><tr>
        <th style="${TH}">Année Etudes</th>
        <th style="${TH}">Elèves A</th><th style="${TH}">EHR</th><th style="${TH}">Elèves FSE PI</th>
        <th style="${TH}">Elèves B</th><th style="${TH}">Total</th><th style="${TH}">Dem. Emploi</th>
        <th style="${TH}">Minimexés</th><th style="${TH}">Autres exemptés</th>
        <th style="${TH}">Elèves comptés plusieurs fois</th><th style="${TH}">Total 6+8</th>
        <th style="${TH}">Nbre Total H</th><th style="${TH}">Nbre Total F</th><th style="${TH}">Validé</th>
      </tr></thead>
      <tbody><tr>
        <td style="${TD}">1</td>
        <td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td>
        <td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td>
        <td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td><td style="${TD}"></td>
        <td style="${TD}"></td>
      </tr></tbody>
    </table>

    <!-- Tableau activités -->
    <div style="font-weight:bold;font-size:10px;background:#c8dde6;padding:4px 8px;border:1px solid #6db3c8;margin-bottom:2px">
      POPULATION SCOLAIRE PAR ACTIVITÉ D'ENSEIGNEMENT, AU 1/10EME
    </div>
    <table>
      <thead><tr>
        <th style="${TH}">N° Activité</th>
        <th style="${TH}">Catégorie</th>
        <th style="${TH}">Activité d'enseignement</th>
        <th style="${TH}">Année Etudes</th>
        <th style="${TH}">Nb Élèves</th>
        <th style="${TH}">Pér. prévues</th>
        <th style="${TH}">Prévue ${annee.split('-')[0]}</th>
        <th style="${TH}">Réel ${annee.split('-')[0]}</th>
        <th style="${TH}">Réel ${annee.split('-')[1]}</th>
      </tr></thead>
      <tbody>
        ${lignesAct}
        <tr style="background:#f5f5e8;font-weight:bold">
          <td colspan="5" style="${TD}">TOTAL</td>
          <td style="${TDR}">${tot_prevu}</td>
          <td style="${TDR}">${tot_prevu}</td>
          <td style="${TDR}">${tot_reel}</td>
          <td style="${TDR}">0</td>
        </tr>
      </tbody>
    </table>
    <div style="font-size:9px;color:#666;margin-top:8px">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie · IIP</div>
    </body></html>`;
}

function genDoc3Html(d, annee, coursCible) {
  const { etab, ue, org, num_organisation, cours, attrs, tot_reel } = d;
  const TH = 'background:#5a9eb0;color:white;padding:4px 8px;font-size:10px;font-weight:bold;text-align:left;border:1px solid #4a8ea0';
  const TD = 'padding:3px 8px;font-size:10px;border:1px solid #ccc';
  const TDR = TD + ';text-align:right';

  // Filtrer les attrs par cours si coursCible spécifié
  const attrsFiltered = coursCible ? attrs.filter(a => a.code_cours === coursCible) : attrs;

  // Lignes récap activités (tous les cours)
  const lignesRecap = cours.map(c => {
    const r = attrs.filter(a => a.code_cours === c.cours_code).reduce((s,a) => s + (a.periodes||0) + (a.autonomie||0), 0);
    return `<tr>
      <td style="${TD}">${c.num_activite}</td>
      <td style="${TD}">${catCours(c)}</td>
      <td style="${TD}">${(c.cours_nom||'').toUpperCase()}</td>
      <td style="${TDR}">1</td>
      <td style="${TDR}">${c.cours_per||0}</td>
      <td style="${TDR}">${c.cours_per||0}</td>
      <td style="${TDR}">${r}</td>
    </tr>`;
  }).join('');

  // Périodes totales
  const per_reelles_org = attrs.reduce((s,a) => a.contrat_mdp==='IIP'?(s+(a.periodes||0)+(a.autonomie||0)):s, 0);
  const per_ext = attrs.reduce((s,a) => a.contrat_mdp!=='IIP'?(s+(a.periodes||0)):s, 0);

  // Pages par cours
  const pageCours = (coursList) => coursList.map(c => {
    const attrsC = attrs.filter(a => a.code_cours === c.cours_code);
    if (attrsC.length === 0) return '';
    const lignesAttr = attrsC.map((a, i) => `<tr>
      <td style="${TD}">${i+1}</td>
      <td style="${TD}">${(a.prof_nom||'').toUpperCase()} ${(a.prof_prenom||'').toUpperCase()} ${a.matricule||''}</td>
      <td style="${TD}"></td>
      <td style="${TD}">Temporaire</td>
      <td style="${TDR}">${a.periodes||0}</td>
      <td style="${TD}"></td>
    </tr>`).join('');

    return `
      <div style="page-break-before:always">
        <div style="font-weight:bold;font-size:10px;background:#c8dde6;padding:4px 8px;border:1px solid #6db3c8;margin-bottom:4px">
          ATTRIBUTION DES ENSEIGNANTS POUR L'ACTIVITÉ D'ENSEIGNEMENT ${(c.cours_nom||'').toUpperCase()}
        </div>
        <table>
          <thead><tr>
            <th style="${TH}">N° Attribution</th><th style="${TH}">Enseignant</th>
            <th style="${TH}">Code dispo</th><th style="${TH}">Statut</th>
            <th style="${TH}">Périodes attribuées</th><th style="${TH}">Suppr.</th>
          </tr></thead>
          <tbody>${lignesAttr}</tbody>
        </table>
      </div>`;
  }).join('');

  const coursCibles = coursCible ? cours.filter(c => c.cours_code === coursCible) : cours;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;padding:10mm}
    table{border-collapse:collapse;width:100%}
    @media print{@page{size:A4 landscape;margin:8mm}.no-print{display:none}}</style>
    </head><body>
    <div style="font-weight:bold;font-size:12px;margin-bottom:6px">Document 3 — Liste des attributions (Statut Encodé école)</div>
    ${entete(etab, ue, org, num_organisation, annee)}

    <!-- KPIs -->
    <div style="display:flex;gap:10px;margin-bottom:10px">
      <div style="border:1px solid #ccc;padding:6px 12px;flex:1;font-size:10px">
        <div style="font-weight:bold;font-size:10px">PÉRIODES RÉELLES ORGANIQUES</div>
        <div>Périodes réelles organiques &nbsp;&nbsp;<b>${per_reelles_org}</b></div>
      </div>
      <div style="border:1px solid #ccc;padding:6px 12px;flex:1;font-size:10px">
        <div style="font-weight:bold;font-size:10px">PÉRIODES PRISES EN INTERVENTIONS EXTÉRIEURES</div>
        <div>Périodes prises en interventions extérieures &nbsp;&nbsp;<b>${per_ext}</b></div>
      </div>
      <div style="border:1px solid #ccc;padding:6px 12px;flex:1;font-size:10px">
        <div style="font-weight:bold;font-size:10px">PÉRIODES DÉJÀ ATTRIBUÉES</div>
        <div>Périodes déjà attribuées &nbsp;&nbsp;<b>${per_reelles_org + per_ext}</b></div>
      </div>
    </div>

    <!-- Récap activités -->
    <div style="font-weight:bold;font-size:10px;background:#c8dde6;padding:4px 8px;border:1px solid #6db3c8;margin-bottom:2px">
      LISTES DES ACTIVITÉS D'ENSEIGNEMENT POUR ATTRIBUTION DES ENSEIGNANTS
    </div>
    <table style="margin-bottom:10px">
      <thead><tr>
        <th style="${TH}">N° Activité</th><th style="${TH}">Catégorie</th>
        <th style="${TH}">Activité d'enseignement</th><th style="${TH}">Année Etudes</th>
        <th style="${TH}">Périodes Doc 8</th><th style="${TH}">Pér. prévues doc2</th>
        <th style="${TH}">Pér. réelles doc2</th>
      </tr></thead>
      <tbody>${lignesRecap}</tbody>
    </table>

    <!-- Détail par cours -->
    ${pageCours(coursCibles)}

    <div style="font-size:9px;color:#666;margin-top:8px">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie · IIP</div>
    </body></html>`;
}

export default function Doc23Modal({ ue_num, section, ue_nom, annee, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [numOrg, setNumOrg] = useState(1);
  const [orgs, setOrgs] = useState([]);
  const tok = localStorage.getItem('token');

  async function charger(org) {
    setLoading(true);
    try {
      const [d, orgList] = await Promise.all([
        fetch(`/api/ref/doc23?section=${encodeURIComponent(section)}&ue_num=${ue_num}&annee=${encodeURIComponent(annee)}&num_organisation=${org}`,
          { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json()),
        fetch(`/api/ref/organisations-ue?ue_num=${ue_num}&section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
          { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json()),
      ]);
      setData(d);
      setOrgs(Array.isArray(orgList) ? orgList : []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { charger(numOrg); }, [numOrg]);

  function ouvrir(html, nom) {
    const htmlAvecTitre = html.replace('<head>', `<head><title>${nom}</title>`);
    const w = window.open('', '_blank', 'width=1200,height=900');
    w.document.write(htmlAvecTitre);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <div className="font-bold text-iip-gold text-lg">DOC2 / DOC3 — UE {ue_num}</div>
            <div className="text-xs text-gray-500">{ue_nom} · {section} · {annee}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Sélecteur organisation */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Organisation</label>
            <select value={numOrg} onChange={e => setNumOrg(parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
              {orgs.length > 0
                ? orgs.map(o => <option key={o.num_organisation} value={o.num_organisation}>
                    Org {o.num_organisation} — {o.date_debut||'?'} → {o.date_fin||'?'}
                  </option>)
                : <option value={1}>Org 1 (pas encore configurée)</option>
              }
            </select>
            {orgs.length === 0 && (
              <p className="text-xs text-orange-500 mt-1">⚠ Configurez d'abord les organisations via 🗓 dans le menu + de l'UE</p>
            )}
          </div>

          {loading ? (
            <div className="text-gray-400 text-sm text-center py-4">Chargement...</div>
          ) : data ? (
            <div className="space-y-3">
              {/* Aperçu */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <div><b>UE {ue_num}</b> — {data.ue?.ue_nom}</div>
                <div>Code FWB : {data.ue?.ue_code_fwb || '—'}</div>
                <div>{data.cours?.length} cours · {data.lignes_ept?.length} lignes EPT</div>
                <div>Périodes prévues : <b>{data.tot_prevu}</b> · Réelles : <b>{data.tot_reel}</b></div>
              </div>

              {/* Boutons */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => ouvrir(genDoc2Html(data, annee), nomDoc('DOC2', 'UE'+ue_num, ue_nom, 'Org'+numOrg, annee))}
                  className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-2 rounded font-medium">
                  📄 DOC2 (populations)
                </button>
                <button onClick={() => ouvrir(genDoc3Html(data, annee, null), nomDoc('DOC3', 'UE'+ue_num, ue_nom, 'Org'+numOrg, annee))}
                  className="bg-iip-mauve hover:opacity-90 text-white text-sm px-4 py-2 rounded font-medium">
                  📋 DOC3 (attributions)
                </button>
              </div>

              {/* DOC3 par cours */}
              {data.cours?.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 mb-2">DOC3 par cours individuel :</div>
                  <div className="space-y-1">
                    {data.cours.map(c => (
                      <button key={c.cours_code}
                        onClick={() => ouvrir(genDoc3Html(data, annee, c.cours_code), nomDoc('DOC3', 'UE'+ue_num, c.cours_nom, 'Org'+numOrg, annee))}
                        className="w-full text-left text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50 flex justify-between items-center">
                        <span><b>{c.num_activite}</b> — {c.cours_nom}</span>
                        <span className="text-gray-400">📋</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-red-400 text-sm text-center py-4">Erreur de chargement</div>
          )}
        </div>

        <div className="px-6 py-3 border-t flex justify-end">
          <button onClick={onClose} className="border border-gray-300 text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-50">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
