### Task 1: Google Cloud project + Supabase local auth config

**Files:**
- Modify: `supabase/config.toml`
- Modify: `.env.local`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: a locally running Supabase Auth instance with the `google` external provider enabled, reachable by later tasks via the existing `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` (already in `.env.local` from a prior plan).

- [ ] **Step 1: Create the Google Cloud OAuth client**

This step is manual (Google's console isn't scriptable). In [Google Cloud Console](https://console.cloud.google.com/):

1. Create a new project (or select an existing one).
2. Go to **APIs & Services > OAuth consent screen**. Choose **External** user type. Fill in the required app name/support email fields. **Publishing status: Testing** is sufficient for local dev - you don't need to submit for verification.
3. Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**. Application type: **Web application** (not Android/iOS - this project uses the browser-based OAuth flow, which only needs a Web client).
4. Under **Authorized redirect URIs**, add exactly:
   ```
   http://127.0.0.1:54321/auth/v1/callback
   ```
5. Save. Copy the **Client ID** and **Client secret** shown - you'll need both in the next step.

- [ ] **Step 2: Add the Google client ID and secret**

In `supabase/config.toml`, find the `[auth.external.apple]` block (used here only as a template for the shape - do not modify it) and add a new block directly after it:

```toml
[auth.external.google]
enabled = true
client_id = "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE"
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = ""
url = ""
# Required for local sign in with Google auth (see the same field's comment under [auth.external.apple]).
skip_nonce_check = true
```

Replace `PASTE_YOUR_GOOGLE_CLIENT_ID_HERE` with the real Client ID from Step 1. OAuth client IDs are meant to be public (unlike secrets), so committing it directly in `config.toml` is standard practice - this is the same pattern the file's own `[auth.external.apple]` template uses for its `client_id` field.

In `.env.local` (gitignored, do not commit), add:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=PASTE_YOUR_GOOGLE_CLIENT_SECRET_HERE
```

Replace with the real Client secret from Step 1.

In `.env.example` (committed - placeholder only), add:

```
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=
```

- [ ] **Step 3: Restart the local Supabase stack**

Config changes like enabling an external provider require a full restart, not just `db reset` (which only re-applies migrations):

```bash
npx supabase stop
npx supabase start
```

- [ ] **Step 4: Verify the provider is enabled**

```bash
curl -s http://127.0.0.1:54321/auth/v1/settings
```

Expected: the output includes `"google":true` somewhere in the `external` object (e.g. `"external":{...,"google":true,...}`).

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml .env.example
git commit -m "chore: enable Google external auth provider in local Supabase config"
```

(`.env.local` is gitignored and intentionally not committed.)

---

