/* (CS) Lucie — le service worker des NOTIFICATIONS, et rien d'autre (3.5.767). Aucun cache, aucune interception des pages : la
   version de Lucie reste celle du serveur. Il montre ce que Lucie envoie au téléphone, et ouvre la bonne page au toucher. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corps: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titre || 'Lucie', {
    body: d.corps || '', tag: d.tag || undefined, data: { lien: d.lien || '/' },
    icon: '/icones/lucie-192.png', badge: '/icones/lucie-masque-192.png',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const lien = new URL((e.notification.data && e.notification.data.lien) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const fen = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of fen) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); try { await c.navigate(lien); } catch { /* */ } return; }
    }
    await self.clients.openWindow(lien);
  })());
});
