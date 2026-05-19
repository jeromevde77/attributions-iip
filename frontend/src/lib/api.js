const BASE = '/api';

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function clearToken() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const t = getToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...headers
    }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);

  // 401 sur une route AUTRE que /auth/login = token expiré → on déconnecte.
  // Sur /auth/login lui-même = identifiants invalides → on laisse remonter l'erreur.
  if (res.status === 401 && !path.startsWith('/auth/login')) {
    clearToken();
    window.location.href = '/login';
    return;
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.blob();
  if (!res.ok) {
    const msg = (isJson && data?.error) || res.statusText || 'Erreur réseau';
    throw new Error(msg);
  }
  return data;
}

export const api = {
  // auth
  login(email, password) {
    return request('/auth/login', { method: 'POST', body: { email, password } })
      .then(r => { setToken(r.token); localStorage.setItem('user', JSON.stringify(r.user)); return r; });
  },
  logout() { clearToken(); window.location.href = '/login'; },
  me() { return request('/auth/me'); },

  // attributions
  attributions(filters = {}) {
    const qs = new URLSearchParams(
      Object.entries(filters).filter(([_, v]) => v !== '' && v != null)
    ).toString();
    return request('/attributions' + (qs ? `?${qs}` : ''));
  },
  attribution(id) { return request(`/attributions/${id}`); },
  createAttribution(data) { return request('/attributions', { method: 'POST', body: data }); },
  updateAttribution(id, data) { return request(`/attributions/${id}`, { method: 'PATCH', body: data }); },
  updateProfStatut(profId, statut) {
    return request(`/attributions/professeur/${profId}/statut`, { method: 'PATCH', body: { statut } });
  },
  deleteAttribution(id) { return request(`/attributions/${id}`, { method: 'DELETE' }); },
  bulkDeleteAttributions(ids) {
    return request('/attributions/bulk-delete', { method: 'POST', body: { ids } });
  },
  bulkDeletePreview(filters = {}) {
    return request('/attributions/bulk-delete-preview', { method: 'POST', body: filters });
  },
  bulkDeleteFiltered(filters = {}) {
    return request('/attributions/bulk-delete-filtered', {
      method: 'POST',
      body: { ...filters, confirm: 'OUI-SUPPRIMER' }
    });
  },

  // admin
  adminStats() { return request('/admin/stats'); },
  adminReimportExcel() { return request('/admin/reimport-excel', { method: 'POST' }); },

  // création en masse depuis section
  sectionUeCours(section) { return request(`/ref/sections/${encodeURIComponent(section)}/ue-cours`); },
  bulkCreateFromSection(section, ue_nums) {
    return request('/attributions/bulk-create-from-section', {
      method: 'POST',
      body: { section, ue_nums }
    });
  },

  // référentiels
  sections() { return request('/ref/sections'); },
  ue(section) { return request('/ref/ue' + (section ? `?section=${encodeURIComponent(section)}` : '')); },
  ueDetail(num) { return request(`/ref/ue/${num}`); },
  cours(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return request('/ref/cours' + (qs ? `?${qs}` : ''));
  },
  professeurs() { return request('/ref/professeurs'); },
  professeur(id) { return request(`/ref/professeurs/${id}`); },
  locaux() { return request('/ref/locaux'); },
  parametres() { return request('/ref/parametres'); },
  typesEncadrement() { return request('/ref/types-encadrement'); },

  // pilotage
  pilotageSectionNiveau() { return request('/pilotage/section-niveau'); },
  pilotageSectionStatut() { return request('/pilotage/section-statut'); },
  pilotageSectionDetail() { return request('/pilotage/section-detail'); },
  totaux() { return request('/pilotage/totaux'); },

  // exports
  doc23() { return request('/exports/doc2-3'); },
  exportExcel() {
    return fetch(BASE + '/exports/excel', {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(async r => {
      if (!r.ok) throw new Error('Export Excel échoué');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attributions-${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
};

export function getUser() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}
export function isAuthenticated() { return !!getToken(); }
