import { initializeApp } from 'firebase/app'
import { getMessaging, getToken } from 'firebase/messaging'

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

export async function registerPushToken(apiClient) {
  try {
    // 通知許可を要求
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      console.log('通知許可が拒否されました')
      return
    }

    // Service Worker を手動で登録
    let swRegistration
    if ('serviceWorker' in navigator) {
      swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      console.log('Service Worker registered:', swRegistration)
    }

    // FCM トークンを取得
    const token = await getToken(messaging, {
      vapidKey:            import.meta.env.VITE_FB_VAPID_KEY,
      serviceWorkerRegistration: swRegistration,  // 手動登録したSWを渡す
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