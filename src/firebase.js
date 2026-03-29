import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FB_API_KEY,
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FB_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const messaging = getMessaging(app)

// フォアグラウンド時の通知表示
onMessage(messaging, (payload) => {
  console.log('フォアグラウンド通知受信:', payload)
  const title = payload.notification?.title || 'Warikan'
  const body  = payload.notification?.body  || ''
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/favicon.ico'
    })
  }
})

// Service Worker が active になるまで待つ
function waitForActiveServiceWorker(registration) {
  return new Promise((resolve) => {
    if (registration.active) {
      resolve(registration)
      return
    }
    const sw = registration.installing || registration.waiting
    if (!sw) { resolve(registration); return }
    sw.addEventListener('statechange', function handler(e) {
      if (e.target.state === 'activated') {
        sw.removeEventListener('statechange', handler)
        resolve(registration)
      }
    })
  })
}

export async function registerPushToken(apiClient) {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('通知許可が拒否されました')
      return
    }

    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker非対応ブラウザ')
      return
    }

    // Service Worker を登録して active になるまで待つ
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
    await waitForActiveServiceWorker(registration)
    console.log('Service Worker active:', registration.active?.state)

    // FCM トークンを取得
    const token = await getToken(messaging, {
      vapidKey:                  import.meta.env.VITE_FB_VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (!token) {
      console.log('FCM トークンが取得できませんでした')
      return
    }

    // バックエンドに登録
    await apiClient.post('/users/device-token', {
      deviceToken: token,
      platform:    'FCM'
    })
    console.log('Push token registered:', token.slice(0, 20) + '...')
  } catch (err) {
    console.error('Failed to register push token:', err)
  }
}