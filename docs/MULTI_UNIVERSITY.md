# Multi-University Runbook

UniFi supports multiple campuses. The **database is the source of truth** for
which email domains may sign up; the `ALLOWED_UNIVERSITY_DOMAINS` environment
variable is only a bootstrap allow-list used to self-heal a missing row.

## How domain allow-listing works

During registration (`backend/src/services/auth.service.js`):

1. The email domain is looked up in `universities` where `isActive = true`.
   - If an active row exists → the student is linked to that campus. ✅
2. If no row exists, the domain must appear in `ALLOWED_UNIVERSITY_DOMAINS`.
   - If it does → the campus row is created automatically (self-heal) and the
     student is linked. ✅
   - Otherwise → registration is rejected with the allowed-domain message. ⛔

This means you can onboard a new campus **either** by adding its domain to
`ALLOWED_UNIVERSITY_DOMAINS` (a redeploy/config change) **or** by inserting the
campus through the admin API (no redeploy). Once the row exists, the env var is
no longer required for that domain.

## Onboard a campus without a redeploy

You can do this from the **Universities** tab in the admin panel (Super Admin
only): fill in the campus details and click **Add university**. It becomes
available for signups immediately. The same operations are exposed over the API:

`SUPER_ADMIN` only:

```bash
# 1. Add the campus
curl -X POST https://<backend>/api/admin/universities \
  -H "Authorization: Bearer <super-admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example Institute of Technology","shortName":"EIT","emailDomain":"eit.ac.in","city":"Pune","state":"Maharashtra"}'

# 2. List campuses with member counts
curl https://<backend>/api/admin/universities \
  -H "Authorization: Bearer <super-admin-access-token>"

# 3. Edit a campus, or deactivate it (blocks new signups for that domain)
curl -X PATCH https://<backend>/api/admin/universities/<id> \
  -H "Authorization: Bearer <super-admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}'
```

Deactivating a campus does **not** remove existing users; it only stops new
registrations for that domain.

## Bootstrap via environment (optional)

Set a comma-separated list to seed/self-heal domains on the fly:

```
ALLOWED_UNIVERSITY_DOMAINS=lpu.in,rguktn.ac.in,eit.ac.in
```

The seed (`backend/prisma/seed.js`) upserts a row for every domain in this list
on deploy when `DB_SEED_ON_DEPLOY=true`.

## Frontend

The signup page loads the active campus list from `GET /api/auth/universities`
and validates the typed email against it. If the list cannot be loaded the
client does **not** block the submission — the backend is the authoritative
check, so a transient API failure can never prevent a valid signup.
