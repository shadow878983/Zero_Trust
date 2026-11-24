# TrustVault API

## Run locally

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` if you have not already configured `.env`.
3. Set `MONGODB_URI` and a private random `JWT_SECRET` in `.env`.
4. Start the API: `npm run dev`
5. Check `http://localhost:5000/api/health`.

Never commit `.env` or share its values.

## Authentication endpoints

- `POST /api/auth/register` accepts `{ "name", "email", "password" }`. Registration assigns the `Student` role and `Unassigned` department on the server. Extra fields such as `role` or `department` are rejected.
- `POST /api/auth/login` accepts `{ "email", "password" }`.
- `GET /api/auth/me` requires `Authorization: Bearer <token>` and returns the current account.
- `POST /api/auth/change-password` requires the current token plus `{ "currentPassword", "newPassword" }`. A successful change invalidates existing tokens; sign in again afterward.
- `POST /api/auth/logout` requires the same header and invalidates all tokens issued to that account.

Passwords are hashed with bcrypt. Tokens expire after one hour. Protected requests reload the account from MongoDB and check its active status and token version, so deactivation and logout take effect on the next request. Registration and login are rate-limited.

## Create the first Admin

From this directory, run `npm run seed:admin` in an interactive terminal. The script prompts for the Admin name, email, and password; password input is hidden. It only creates the account if no Admin currently exists. Public registration cannot create or promote Admin accounts.

## Admin user management

Both endpoints require a current Admin token:

- `GET /api/admin/users` lists up to 100 users.
- `PATCH /api/admin/users/:id` accepts one or more of `role`, `department`, and `isActive`.

The API rejects unsupported fields and invalid role/department values. An Admin cannot demote or deactivate their own account, and the last active Admin cannot be demoted or deactivated.

## Document endpoints

- `POST /api/documents` accepts multipart fields `file`, `title`, `description`, `department`, and `classification`. Upload is Admin-only. PDF and plain text files are allowed, up to 10 MB.
- `GET /api/documents` lists only documents the current user can read.
- `GET /api/documents/:id` returns authorized document metadata.
- `GET /api/documents/:id/preview` rechecks preview authorization and streams a PDF/TXT inline.
- `GET /api/documents/:id/download` rechecks current download authorization and streams the private file.

Files are stored under `backend/storage` using generated filenames. The folder is outside the frontend's public assets and is never mounted as a static route.

## Document authorization policy

`Document`, `Permission`, and `AuditLog` schemas are in `src/models`. `src/services/authorizationService.js` evaluates authorization using the current database user, document, and grants, and writes an audit entry for each decision. If an audit write fails, the service throws so a document route fails closed.

Current policy defaults:

- Active Admins and document owners can read, download, and manage.
- Any other active user can read and download Public documents.
- Faculty and Department Heads can read and download Internal documents in their department.
- Department Heads can manage documents in their department.
- Confidential and Restricted documents require an active explicit grant for non-owners and non-Admins.
- Read grants permit listing and viewing document metadata, but do not permit preview or download. Download grants permit preview and download; Manage grants permit all three actions. Expiry and revocation are checked from MongoDB at request time.
- Public-document and same-department Internal-document policy can independently permit preview and download, even without an explicit grant.

## Grant management

All grant-management endpoints require a current Admin token:

- `POST /api/documents/:id/share` accepts `{ "userId", "permissionType", "expiresAt" }`, where `permissionType` is `Read`, `Download`, or `Manage`, and `expiresAt` is a future ISO-8601 timestamp.
- `GET /api/documents/:id/permissions` lists grant history for a document, including expiry and revocation state.
- `DELETE /api/documents/:id/share/:userId` revokes outstanding grants for that user and document. Subsequent requests check the updated grant state from MongoDB.

A user/document pair has at most one outstanding grant. Creating a new grant revokes the previous grant first, preserving grant history and preventing an older, broader grant from remaining active.

## Audit logs

`GET /api/admin/audit-logs` requires a current Admin token. It returns the newest audit decisions and events, including actor, document metadata, action, allow/deny result, reason, timestamp, and safe metadata. It never returns file paths or document contents.

Optional query parameters: `page`, `limit` (maximum 100), `action`, `result`, `userId`, `documentId`, `from`, and `to`. Dates must be ISO-8601 timestamps with a timezone.
