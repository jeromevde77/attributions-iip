const BASE = '/api';

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

// Année scolaire active — persistée dans localStorage
export function getAnnee() { return localStorage.getItem('annee_active') || '2025-2026'; }
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
  if (!res.ok) throw new Error((isJson && data?.error) || res.statusText || 'Erreur réseau');
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

  // historique & config
  historiqueConfig() { return request('/historique/config'); },
  setHistoriqueConfig(actif) { return request('/historique/config', { method: 'POST', body: { actif } }); },
  historique(annee, limit = 100) { return request(withAnnee('/historique', { limit })); },
  historiqueAttribution(id) { return request(`/historique/attribution/${id}`); },
  rollback(snapshotId) { return request(`/historique/rollback/${snapshotId}`, { method: 'POST' }); },

  // années scolaires
  annees() { return request('/annees'); },
  createAnnee(data) { return request('/annees', { method: 'POST', body: data }); },
  deleteAnnee(code) { return request(`/annees/${encodeURIComponent(code)}`, { method: 'DELETE' }); },

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
  activites() { return request('/ref/activites'); },
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

  // création en masse depuis section
  sectionUeCours(section) { return request(`/ref/sections/${encodeURIComponent(section)}/ue-cours`); },
  bulkCreateFromSection(section, ue_nums) {
    return request('/attributions/bulk-create-from-section', {
      method: 'POST', body: { section, ue_nums, annee_scolaire: getAnnee() }
    });
  },

  // référentiels
  sections() { return request('/ref/sections'); },
  ue(section) { return request('/ref/ue' + (section ? `?section=${encodeURIComponent(section)}` : '')); },
  ueDetail(num) { return request(`/ref/ue/${num}`); },
  cours(params = {}) { return request('/ref/cours' + (new URLSearchParams(params).toString() ? `?${new URLSearchParams(params)}` : '')); },
  professeurs() { return request('/ref/professeurs'); },
  professeur(id) { return request(`/ref/professeurs/${id}`); },
  locaux() { return request('/ref/locaux'); },
  parametres() { return request('/ref/parametres'); },
  typesEncadrement() { return request('/ref/types-encadrement'); },

  // pilotage (filtrés par année active)
  pilotageSectionNiveau() { return request(withAnnee('/pilotage/section-niveau')); },
  pilotageSectionStatut() { return request(withAnnee('/pilotage/section-statut')); },
  pilotageSectionDetail() { return request(withAnnee('/pilotage/section-detail')); },
  totaux()               { return request(withAnnee('/pilotage/totaux')); },

  // exports
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
  }
};

export function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}
export function isAuthenticated() { return !!getToken(); }
