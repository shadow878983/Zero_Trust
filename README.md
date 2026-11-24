# TrustVault

Zero-Trust Campus Document Exchange for NexHack 2.0.

## Architecture

- `frontend/`: React + Vite dashboard. It presents documents and actions, but is never trusted to enforce access.
- `backend/`: Express API. It authenticates users and checks current user, document, and grant state on every protected request.
- MongoDB: users, document metadata, access grants, and audit events.
- `backend/storage/`: private uploaded files. Files are served only through authorization-checked API routes and are not placed in the frontend's public directory.

## First milestone

Build the smallest demonstrable security flow: authenticate a user, request a document, evaluate current access on the server, and record the allow or deny decision. Then add upload and grant/revoke workflows around it.

## Local development

Setup and run instructions will be added as the app is implemented. Never commit `.env` files or real documents/credentials.
