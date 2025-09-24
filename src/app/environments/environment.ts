export const environment = {
  production: false,
  apiUrl: 'http://localhost:9090/api/v1',
  wsUrl: 'http://localhost:9090/api/v1/ws',
  keycloak: {
    url: 'http://localhost:8080',
    realm: 'syncspace_realm',
    clientId: 'syncspace'
  }
};
