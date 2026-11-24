# TrustVault frontend

React + Vite client for the TrustVault campus document exchange API.

## Start locally

1. From this folder, run `npm install` once.
2. Copy `.env.example` to `.env` if the API is not at `http://localhost:5000`, then set `VITE_API_BASE_URL` to the API origin. Do not commit `.env`.
3. Start the backend, then run `npm run dev` here.
4. Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

The client keeps the session token in `sessionStorage` and sends it as a bearer token. The API remains responsible for authorization decisions; this UI only displays available actions.
