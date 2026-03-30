const clientId = import.meta.env.VITE_CLIENT_ID;
const tenantId = import.meta.env.VITE_TENANT_ID;

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri:
      import.meta.env.VITE_REDIRECT_URI ||
      "http://localhost:5173/auth/callback",
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};
