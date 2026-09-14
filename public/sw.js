// Service worker mínimo para notificaciones push. Solo escucha "push" y
// "notificationclick" — sin caché, sin interceptar "fetch", sin ciclo de
// instalación/activación propio.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Eos'

  // Botones de la notificación ("Ya los hice" / "No los hice hoy"): solo si
  // el navegador los soporta de verdad. Safari (escritorio e iOS) descarta
  // el array entero sin avisar; Notification.maxActions es el único dato
  // fiable en tiempo de ejecución (no hay forma de "detectar" el soporte de
  // otro modo), y de paso es el límite real (Chrome/Firefox: 2) — ya no hace
  // falta un tercer botón "Responder": tocar el cuerpo abre la app igual.
  // Sin token no hay nada que completar sin abrir la app, así que tampoco se
  // ofrecen botones (p. ej. el aviso de prueba, que no trae uno).
  const supportsActions = typeof Notification !== 'undefined' && (Notification.maxActions || 0) >= 2
  const actions =
    supportsActions && data.token
      ? [
          { action: 'complete', title: 'Ya los hice' },
          { action: 'incomplete', title: 'No los hice hoy' },
        ]
      : undefined

  const options = {
    body: data.body || '',
    icon: '/icons/eos-icono-192.png',
    badge: '/icons/eos-notificacion-96.png',
    data,
    actions,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/** Enfoca una ventana ya abierta de la app, o abre una nueva. */
function openApp(url) {
  return clients.matchAll({ type: 'window' }).then((all) => {
    for (const client of all) {
      if ('focus' in client) return client.focus()
    }
    if (clients.openWindow) return clients.openWindow(url || '/')
    return undefined
  })
}

/** Llama a complete-habits con el token del aviso y el valor elegido. */
function respondToReminder(data, done) {
  return fetch(data.completeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: data.apikey || '' },
    body: JSON.stringify({ token: data.token, done }),
  })
    .then((res) =>
      res.ok
        ? self.registration.showNotification('Eos', {
            body: done ? 'Hábitos marcados como hechos.' : 'Hábitos marcados como no hechos.',
            icon: '/icons/eos-icono-192.png',
            badge: '/icons/eos-notificacion-96.png',
          })
        : Promise.reject(new Error('HTTP ' + res.status)),
    )
    .catch(() =>
      self.registration.showNotification('Eos', {
        body: 'No se pudo guardar. Abre la app para responder.',
        icon: '/icons/eos-icono-192.png',
        badge: '/icons/eos-notificacion-96.png',
      }),
    )
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {}
  event.notification.close()

  if ((event.action === 'complete' || event.action === 'incomplete') && data.token && data.completeUrl) {
    event.waitUntil(respondToReminder(data, event.action === 'complete'))
    return
  }

  // Tocar el cuerpo (sin botón, action === ""): abrir/enfocar la app.
  event.waitUntil(openApp(data.url))
})
