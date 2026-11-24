# TrustVault

Zero-Trust Campus Document Exchange for NexHack 2.0.

## Architecture

- `frontend/`: React + Vite dashboard. It presents documents and actions, but is never trusted to enforce access.
- `backend/`: Express API. It authenticates users and checks current user, document, and grant state on every protected request.
- MongoDB: users, document metadata, access grants, and audit events.
- `backend/storage/`: private uploaded files. Files are served only through authorization-checked API routes and are not placed in the frontend's public directory.

## Implemented so far

The backend includes MongoDB connectivity, authentication, one-time Admin setup, Admin user management, document metadata, private PDF/TXT upload and download routes, and a shared RBAC + ABAC authorization service. See [backend/README.md](backend/README.md) for API details and current policy defaults.

The first milestone is the zero-trust document flow: authorize every request against current database state, revoke grants immediately, and record an explainable audit decision.

Never commit `.env` files, credentials, or uploaded documents.
