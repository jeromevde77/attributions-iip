const BASE = '/api';

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

// Année scolaire active — persistée dans localStorage
export function getAnnee() { return localStorage.getItem('annee_active') || '2026-2027'; }

// Unité d'affichage/saisie des attributions : 'periodes' (défaut) ou 'heures'
// Stockage toujours en périodes ; les heures ne sont qu'une aide. 1 période = 50 min.
export function getUnite() { return localStorage.getItem('unite_saisie') || 'periodes'; }
export function setUnite(u) { localStorage.setItem('unite_saisie', u); }
export function perToH(per) { return Math.round((Number(per) || 0) / 1.2); }   // périodes → heures (arrondi)
export function hToPer(h)  { return Math.round((Number(h) || 0) * 1.2); }       // heures → périodes (arrondi)
export function setAnnee(a) { localStorage.setItem('annee_active', a); }

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const t = getToken();
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...headers }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearToken(); window.location.href = '/login'; return;
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.blob();
  if (!res.ok) {
    const err = new Error((isJson && data?.error) || res.statusText || 'Erreur réseau');
    err.status = res.status;
    err.body = isJson ? data : {};
    throw err;
  }
  return data;
}

// Ajoute ?annee=... à une URL (ou l'injecte parmi les autres params)
function withAnnee(path, extra = {}) {
  const annee = getAnnee();
  const all = { annee, ...extra };
  const qs = new URLSearchParams(Object.entries(all).filter(([, v]) => v !== '' && v != null)).toString();
  return path + (qs ? `?${qs}` : '');
}

export const api = {
  // auth
  login(email, password) {
    return request('/auth/login', { method: 'POST', body: { email, password } })
      .then(r => { setToken(r.token); localStorage.setItem('user', JSON.stringify(r.user)); return r; });
  },
  logout() { clearToken(); window.location.href = '/login'; },
  me() { return request('/auth/me'); },

  // référentiels — structure et CRUD
  refStructure() { return request(withAnnee('/ref/structure')); },
  grilleSection(section) { return request(`/ref/grille-section?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(getAnnee())}`); },
  createUE(data) { return request('/ref/ue', { method: 'POST', body: { annee_scolaire: getAnnee(), ...data } }); },
  importEffectifs(effectifs) { return request('/ref/ue/effectifs-import', { method: 'POST', body: { annee: getAnnee(), effectifs } }); },
  updateUE(num, data) { return request(`/ref/ue/${num}`, { method: 'PATCH', body: { annee_scolaire: getAnnee(), ...data } }); },
  deleteUE(num) { return request(withAnnee(`/ref/ue/${num}`), { method: 'DELETE' }); },
  createCours(data) { return request('/ref/cours', { method: 'POST', body: { annee_scolaire: getAnnee(), ...data } }); },
  updateCours(code, data) { return request(`/ref/cours/${encodeURIComponent(code)}`, { method: 'PATCH', body: { annee_scolaire: getAnnee(), ...data } }); },
  renameCoursCode(code, nouveau_code) { return request(`/ref/cours/${encodeURIComponent(code)}/rename`, { method: 'PATCH', body: { annee_scolaire: getAnnee(), nouveau_code } }); },
  renameUENum(num, nouveau_num) { return request(`/ref/ue/${encodeURIComponent(num)}/rename`, { method: 'PATCH', body: { annee_scolaire: getAnnee(), nouveau_num } }); },
  dedoublerUE(ue_num) { return request(`/ref/ue/${encodeURIComponent(ue_num)}/dedoubler`, { method: 'PATCH', body: { annee_scolaire: getAnnee() } }); },
  organiserGroupesUE(ue_num, body) {
    return request(`/ref/ue/${encodeURIComponent(ue_num)}/organiser-groupes`, {
      method: 'PATCH', body: { annee_scolaire: getAnnee(), ...body },
    });
  },
  annulerDedoublementUE(ue_num) { return request(`/ref/ue/${encodeURIComponent(ue_num)}/annuler-dedoublement`, { method: 'PATCH', body: { annee_scolaire: getAnnee() } }); },
  deleteCours(code) { return request(withAnnee(`/ref/cours/${encodeURIComponent(code)}`), { method: 'DELETE' }); },
  createSection(data) { return request('/ref/sections', { method: 'POST', body: data }); },
  updateSection(code, data) { return request(`/ref/sections/${encodeURIComponent(code)}`, { method: 'PATCH', body: data }); },
  deleteSection(code) { return request(`/ref/sections/${encodeURIComponent(code)}`, { method: 'DELETE' }); },
  maskSection(code, annee) { return request(`/ref/sections/${encodeURIComponent(code)}/masquer`, { method: 'POST', body: { annee_scolaire: annee } }); },

  // historique & config
  historiqueConfig() { return request('/historique/config'); },
  changelog() { return request('/historique/changelog'); },
  setHistoriqueConfig(actif) { return request('/historique/config', { method: 'POST', body: { actif } }); },
  historique(annee, limit = 100) { return request(withAnnee('/historique', { limit })); },
  etablissement() { return request('/etablissement'); },
  saveEtablissement(data) { return request('/etablissement', { method: 'PUT', body: data }); },
  parametres() { return request('/parametres'); },
  saveParametres(updates) { return request('/parametres/bulk', { method: 'PUT', body: updates }); },
  activiteFeed(jours = 7, limit = 200) { return request(withAnnee('/historique/activite', { jours, limit })); },
  activiteTraitee(snapshotId, traitee = true) { return request(`/historique/activite/${snapshotId}/traitee`, { method: 'POST', body: { traitee } }); },
  historiqueAttribution(id) { return request(`/historique/attribution/${id}`); },
  rollback(snapshotId) { return request(`/historique/rollback/${snapshotId}`, { method: 'POST' }); },

  // années scolaires
  annees() { return request('/annees'); },
  createAnnee(data) { return request('/annees', { method: 'POST', body: data }); },
  deleteAnnee(code) { return request(`/annees/${encodeURIComponent(code)}`, { method: 'DELETE' }); },
  renameAnnee(code, nouveau_code) { return request(`/annees/${encodeURIComponent(code)}/rename`, { method: 'PATCH', body: { nouveau_code } }); },
  importPreview(source, cible) { return request(`/annees/import-preview?source=${encodeURIComponent(source)}&cible=${encodeURIComponent(cible)}`); },
  importUEs(data) { return request('/annees/import-ues', { method: 'POST', body: data }); },

  // attributions (toujours filtrées par année active)
  attributions(filters = {}) {
    const { annee: _a, ...rest } = filters; // ignorer annee si passé dans filters
    const qs = new URLSearchParams(
      Object.entries({ annee: getAnnee(), ...rest }).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request('/attributions' + (qs ? `?${qs}` : ''));
  },
  attribution(id) { return request(`/attributions/${id}`); },
  createAttribution(data) {
    return request('/attributions', { method: 'POST', body: { annee_scolaire: getAnnee(), ...data } });
  },
  attributionsByCours(section, code_cours) {
    return request(withAnnee(`/attributions/by-cours`, { section, code_cours }));
  },
  activites(params = {}) {
    const q = new URLSearchParams();
    if (params.section) q.set('section', params.section);
    if (params.ue_num)  q.set('ue_num',  params.ue_num);
    const qs = q.toString();
    return request(`/ref/activites${qs ? '?' + qs : ''}`);
  },
  updateAttribution(id, data) { return request(`/attributions/${id}`, { method: 'PATCH', body: data }); },
  updateProfStatut(profId, statut) {
    return request(`/attributions/professeur/${profId}/statut`, { method: 'PATCH', body: { statut } });
  },
  deleteAttribution(id) { return request(`/attributions/${id}`, { method: 'DELETE' }); },
  bulkDeleteAttributions(ids) {
    return request('/attributions/bulk-delete', { method: 'POST', body: { ids } });
  },
  bulkDeletePreview(filters = {}) {
    return request('/attributions/bulk-delete-preview', { method: 'POST', body: { annee_scolaire: getAnnee(), ...filters } });
  },
  bulkDeleteFiltered(filters = {}) {
    return request('/attributions/bulk-delete-filtered', {
      method: 'POST', body: { annee_scolaire: getAnnee(), ...filters, confirm: 'OUI-SUPPRIMER' }
    });
  },

  // admin
  adminStats() { return request('/admin/stats'); },
  adminReimportExcel() { return request('/admin/reimport-excel', { method: 'POST' }); },
  regenerateFakeData() { return request('/admin/regenerate-fake-data', { method: 'POST' }); },
  purgeAnnee(annee) {
    return request(`/admin/purge-annee/${annee}`, {
      method: 'DELETE',
      body: { confirmation: `PURGER-${annee}` }
    });
  },

  // création en masse depuis section
  sectionUeCours(section) { return request(withAnnee(`/ref/sections/${encodeURIComponent(section)}/ue-cours`)); },
  bulkCreateFromSection(section, ue_nums) {
    return request('/attributions/bulk-create-from-section', {
      method: 'POST', body: { section, ue_nums, annee_scolaire: getAnnee() }
    });
  },
  copierSection(section, annee_source, annee_dest, force = false) {
    return request('/attributions/copier-section', {
      method: 'POST', body: { section, annee_source, annee_dest, force }
    });
  },
  anneesParSection() { return request('/attributions/annees-par-section'); },
  reouvrirUE(ue_num, section, source_organisation) {
    return request('/attributions/reouvrir', {
      method: 'POST', body: { ue_num, section, source_organisation, annee_scolaire: getAnnee() }
    });
  },
  autoFillPeriodes(section) {
    return request('/attributions/auto-fill-periodes', {
      method: 'POST', body: { section, annee_scolaire: getAnnee() }
    });
  },
  setQuadriOrganisation(ue_num, num_organisation, section, quadrimestre) {
    return request('/attributions/organisation/quadrimestre', {
      method: 'PATCH', body: { ue_num, num_organisation, section, quadrimestre, annee_scolaire: getAnnee() }
    });
  },

  // référentiels
  sections() { return request('/ref/sections'); },
  catalogueUE() { return request(withAnnee('/ref/catalogue-ue')); },
  rattacherUE(ue_num, section_code) { return request('/ref/ue-section', { method: 'POST', body: { ue_num, section_code, annee_scolaire: getAnnee() } }); },
  appliquerNominations(ue_num, section) { return request('/nominations/appliquer', { method: 'POST', body: { annee: getAnnee(), ue_num, section } }); },
  creerLigneDepuisCours(cours_code, ue_num, section) { return request('/attributions/creer-depuis-cours', { method: 'POST', body: { annee: getAnnee(), cours_code, ue_num, section } }); },
  toggleConge(id) { return request(`/attributions/${id}/conge`, { method: 'POST', body: {} }); },
  apercuSuppressionSection(section) { return request(`/attributions/section/${encodeURIComponent(section)}/apercu-suppression?annee=${encodeURIComponent(getAnnee())}`); },
  supprimerToutSection(section) { return request(`/attributions/section/${encodeURIComponent(section)}/tout?annee=${encodeURIComponent(getAnnee())}`, { method: 'DELETE' }); },
  detacherUE(ue_num, section_code) { return request(withAnnee(`/ref/ue-section/${ue_num}/${encodeURIComponent(section_code)}`), { method: 'DELETE' }); },
  renameSectionCode(ancien, nouveau_code) { return request(`/ref/sections/${encodeURIComponent(ancien)}/code`, { method: 'PATCH', body: { nouveau_code } }); },
  ue(section) { return request('/ref/ue' + (section ? `?section=${encodeURIComponent(section)}` : '')); },
  ueDetail(num) { return request(`/ref/ue/${num}`); },
  cours(params = {}) { return request('/ref/cours' + (new URLSearchParams(params).toString() ? `?${new URLSearchParams(params)}` : '')); },
  professeurs(tous = false, annee = null) {
    const p = new URLSearchParams();
    if (tous) p.set('tous', '1');
    if (annee) p.set('annee', annee);
    const q = p.toString();
    return request(`/ref/professeurs${q ? '?' + q : ''}`);
  },
  professeur(id, annee) { return request(`/ref/professeurs/${id}${annee ? '?annee=' + encodeURIComponent(annee) : ''}`); },
  professeursAttributions(ids, annee) { return request(`/ref/professeurs-attributions?ids=${encodeURIComponent(ids)}${annee ? '&annee=' + encodeURIComponent(annee) : ''}`); },
  createProfesseur(data) { return request('/ref/professeurs', { method: 'POST', body: data }); },
  updateProfesseur(id, data) { return request(`/ref/professeurs/${id}`, { method: 'PATCH', body: data }); },
  deleteProfesseur(id) { return request(`/ref/professeurs/${id}`, { method: 'DELETE' }); },
  saveProfTitres(id, titres) { return request(`/ref/professeurs/${id}/titres`, { method: 'PUT', body: { titres } }); },
  updateProfAdmin(id, data) { return request(`/ref/professeurs/${id}/admin`, { method: 'PUT', body: data }); }, // missions/coordinations
  fonctions() { return request('/ref/fonctions'); },
  personnelMatrice(section, annee) { return request(`/ref/personnel-matrice?section=${encodeURIComponent(section)}${annee ? '&annee=' + encodeURIComponent(annee) : ''}`); },
  setMission(data) { return request('/ref/personnel-mission', { method: 'PUT', body: data }); },
  saveProfCharges(id, charges) { return request(`/ref/professeurs/${id}/charges`, { method: 'PUT', body: { charges } }); },
  saveProfAncienneteCours(id, reports) { return request(`/ref/professeurs/${id}/anciennete-cours`, { method: 'PUT', body: { reports } }); },
  locaux() { return request('/ref/locaux'); },
  parametres() { return request('/ref/parametres'); },
  typesEncadrement() { return request('/ref/types-encadrement'); },

  // pilotage (filtrés par année active)
  pilotageSectionNiveau() { return request(withAnnee('/pilotage/section-niveau')); },
  pilotageSectionStatut() { return request(withAnnee('/pilotage/section-statut')); },
  pilotageSectionDetail() { return request(withAnnee('/pilotage/section-detail')); },
  totaux()               { return request(withAnnee('/pilotage/totaux')); },

  // pilotage par année civile
  pilotageCivil()                   { return request('/pilotage/civil'); },
  pilotageCivilDetail(annee)        { return request(`/pilotage/civil/${annee}`); },
  dotationCivilePut(annee, body)    { return request(`/pilotage/dotation-civile/${annee}`, { method: 'PUT', body }); },
  dotationCivileDelete(annee)       { return request(`/pilotage/dotation-civile/${annee}`, { method: 'DELETE' }); },
  enveloppesGet()                   { return request('/pilotage/enveloppes'); },
  enveloppePost(body)               { return request('/pilotage/enveloppes', { method: 'POST', body }); },
  enveloppePut(id, body)            { return request(`/pilotage/enveloppes/${id}`, { method: 'PUT', body }); },
  enveloppeDelete(id)               { return request(`/pilotage/enveloppes/${id}`, { method: 'DELETE' }); },
  ueWithPot(annee, section, tous) {
    const p = new URLSearchParams({ annee: annee || getAnnee() });
    if (section) p.set('section', section);
    if (tous) p.set('tous', '1');
    return request(`/pilotage/ue-pot?${p}`);
  },
  ueSetPot(ue_num, annee_scolaire, pot_code) { return request('/pilotage/ue-pot', { method: 'PATCH', body: { ue_num, annee_scolaire, pot_code } }); },

  dotationUE(section, annee, mode) {
    return request(`/pilotage/dotation-ue?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}&mode=${mode}`);
  },
  dotationComparaison(annee1, annee2, pot, pondere = true, mode = 'scolaire') {
    const p = new URLSearchParams({ annee1, annee2 });
    if (pot) p.set('pot', pot);
    if (!pondere) p.set('pondere', '0');
    if (mode === 'civil') p.set('mode', 'civil');
    return request(`/pilotage/dotation-comparaison?${p}`);
  },
  doc23() { return request(withAnnee('/exports/doc2-3')); },
  exportExcel() {
    return fetch(`${BASE}/exports/excel?annee=${encodeURIComponent(getAnnee())}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(async r => {
      if (!r.ok) throw new Error('Export Excel échoué');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `attributions-${getAnnee()}-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    });
  },

  // ---- EA12 ----
  ea12List(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request('/ea12' + (qs ? '?' + qs : ''));
  },
  ea12Get(id) { return request(`/ea12/${id}`); },
  ea12Create(body) { return request('/ea12', { method: 'POST', body }); },
  ea12Update(id, body) { return request(`/ea12/${id}`, { method: 'PUT', body }); },
  purgeAnnee(annee) {
    return request(`/admin/purge-annee/${annee}`, {
      method: 'DELETE',
      body: { confirmation: `PURGER-${annee}` }
    });
  },
  ea12Apercu(id) { return request(`/ea12/${id}/apercu`); },
  ea12Document(id, filename) {
    return fetch(`${BASE}/ea12/${id}/document`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(async r => {
      if (!r.ok) throw new Error('Génération du document échouée');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'EA12.docx';
      a.click(); URL.revokeObjectURL(url);
    });
  },
  ficheDocumentPdf(id, filename) {
    return fetch(`${BASE}/ref/professeurs/${id}/fiche-pdf`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(async r => {
      if (!r.ok) {
        let msg = 'Génération de la fiche échouée';
        try { const j = await r.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'Fiche_signaletique.pdf';
      a.click(); URL.revokeObjectURL(url);
    });
  },
  ea12DocumentPdf(id, filename) {
    return fetch(`${BASE}/ea12/${id}/document-pdf`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(async r => {
      if (!r.ok) {
        let msg = 'Génération du PDF échouée';
        try { const j = await r.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'EA12.pdf';
      a.click(); URL.revokeObjectURL(url);
    });
  }
};

export function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}
export function isAuthenticated() { return !!getToken(); }

// ── Nommage des documents générés ────────────────────────────────────────────
export function nomDoc(...parts) {
  const today = new Date().toISOString().slice(0,10); // YYYY-MM-DD
  const clean = s => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // supprime accents
    .replace(/[^a-zA-Z0-9\-]/g, '_')                  // espaces et ponctuation → _
    .replace(/_+/g, '_')                               // doubles underscores
    .replace(/^_|_$/g, '');                            // trim underscores
  return [...parts, today].map(clean).filter(Boolean).join('_');
}
