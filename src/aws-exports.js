const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId:       import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      signUpVerificationMethod: 'code',
      loginWith: {
        email: true,
        oauth: {
          domain:          import.meta.env.VITE_COGNITO_DOMAIN,
          scopes:          ['email', 'openid', 'profile'],
          redirectSignIn:  [import.meta.env.VITE_REDIRECT_URL],
          redirectSignOut: [import.meta.env.VITE_REDIRECT_URL],
          responseType:    'code',
        }
      }
    }
  }
}

export default awsConfig