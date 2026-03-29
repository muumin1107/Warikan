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
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FB_VAPID_KEY
    })
    if (!token) return

    await apiClient.post('/users/device-token', {
      deviceToken: token,
      platform: 'FCM'
    })
    console.log('Push token registered')
  } catch (err) {
    console.error('Failed to register push token:', err)
  }
}