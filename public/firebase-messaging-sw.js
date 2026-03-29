importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:            'AIzaSyCAczfhbHOBrgPwRo4UlhR0bP-fKilgmvI',
  authDomain:        'warikan-dev-cb271.firebaseapp.com',
  projectId:         'warikan-dev-cb271',
  storageBucket:     'warikan-dev-cb271.firebasestorage.app',
  messagingSenderId: '940238463613',
  appId:             '1:940238463613:web:f0852d46766412e8f54714',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon: '/vite.svg'
    }
  )
})