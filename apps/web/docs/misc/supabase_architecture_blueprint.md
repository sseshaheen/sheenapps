# Supabase‑first Architecture Blueprint for SheenApps

> **Goal:** Ship persistent, versioned, collaborative projects today—**Supabase‑only**—with zero future lock‑in.

---

## 1 · High‑level picture

```text
┌───────────────────┐
│   Web Client      │
│ (React/Next UI)   │
└───────┬───────────┘
        │ ① Auth JWT
┌───────▼─────────────┐
│  Supabase Postgres  │ ← immutable commit graph + mutable heads
│  (RLS · Realtime)   │
└───────┬─────────────┘
        │ ② Signed URLs
┌───────▼─────────────┐
│  Supabase Storage   │ ← blobs · assets · build artefacts
└───────┬─────────────┘
        │ ③ Edge Fn “site-router”
┌───────▼─────────────┐   *.sheenapps.com
│  Custom Domain CDN  │ ← static pages & API per project / branch
└─────────────────────┘
```

* **Auth** → Supabase Auth (email / magic‑link / OAuth).  
* **Data** → Postgres stores *metadata & refs*; heavy binaries live in Storage.  
* **Collab** → Postgres Realtime channels stream commit/CRDT deltas.  
* **Deploy** → Advancing the `prod` ref auto‑serves the built site under  
  `https://{subdomain}.sheenapps.com`.

---

## 2 · Schema (`supabase/migrations/0001_projects.sql`)

```sql
create extension if not exists "pgcrypto";

create table projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users on delete cascade,
  name        text not null,
  subdomain   text unique,          -- “coolshop”
  created_at  timestamptz default now()
);

create table branches (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects on delete cascade,
  name        text not null,        -- “main”, “feature-a”
  head_id     uuid,                 -- current commit
  unique(project_id, name)
);

create table commits (
  id          uuid primary key,     -- client generates
  project_id  uuid references projects on delete cascade,
  author_id   uuid references auth.users,
  parent_ids  uuid[] not null,
  tree_hash   text  not null,       -- SHA‑256 root tree in Storage
  message     text,
  created_at  timestamptz default now()
);

create table assets (
  hash        text primary key,     -- SHA‑256 of blob
  mime_type   text,
  size        int8,
  uploaded_at timestamptz default now(),
  uploader_id uuid references auth.users
);
```

### Row‑level security (multi‑tenant & collaboration)

```sql
alter table projects enable row level security;

create policy "owners or collaborators"
  on projects
  using (owner_id = auth.uid() OR auth.uid() = any(collaborator_ids));

-- Repeat for branches/commits/assets by joining back to projects(id)
```

---

## 3 · Storage buckets

| Bucket | Purpose | Path layout |
|--------|---------|-------------|
| `objects` | Content‑addressed blobs (HTML, JSON, CRDT, source) | `objects/<sha256>` |
| `assets`  | User uploads (images, fonts, etc.) | `assets/<projectId>/<sha256>` |
| `builds`  | Production build zips | `builds/<projectId>/<commitId>.zip` |

---

## 4 · Versioning & live‑editing flow

1. **Client** stages a local commit `{tree_hash, parent_ids:[HEAD]}` and any CRDT patch.  
2. Upload new blobs → insert `commits` row → `update branches set head_id = :commit`.  
3. **Realtime** channel `branches:{id}` notifies peers → auto‑merge CRDT + fast‑forward.  
4. **Undo / redo** = jump to older/newer commit inside the branch.  
5. **Branch** = `insert into branches (…)`.

Everything is immutable except the branch `head_id`.

---

## 5 · Preview & production environments

* Supabase **Branching** can spin up isolated Postgres + Storage per Git branch for CI and tests.  
* Your SaaS re‑uses the same idea so **users** can branch inside their own project.

---

## 6 · Custom sub‑domains (`*.sheenapps.com`)

1. DNS wildcard `*.sheenapps.com →` your CDN (Vercel, Cloudflare, etc.).  
2. Supabase **Custom Domains** shares the host across Edge Functions & Storage.  
3. Edge Function **`site‑router`** reads `Host`, fetches `builds/{project}/{commit}.zip`, serves.  
4. Add `https://*.sheenapps.com/*` to Supabase Auth redirect allow‑list.

---

## 7 · Authentication & sharing

* **Public branches** – `is_public` flag; anonymous `select` allowed by RLS.  
* **Collaborators** – store extra user IDs in `projects.collaborator_ids[]`.  
* **SSO** – enable GitHub, Google, etc. in Supabase Auth; JWT works transparently.

---

## 8 · Deploy pipeline

| Step | Tool |
|------|------|
| Build site (WebWorker) | HTML/JS/CSS → `objects/` |
| Zip + upload | `supabase.storage.from('builds').upload` |
| “Release” commit | marks exact `tree_hash` |
| Fast‑forward `prod` | `update branches …` |
| Cache‑bust | Edge router adds `?v={commitId}` |

Rollback = update `branches.head_id` to older commit.

---

## 9 · Initial 10‑day sprint

| Day | Deliverable |
|-----|-------------|
| 0‑1 | Supabase project · buckets · run migration |
| 2‑3 | `supabase-js v2` auth + project list |
| 4‑5 | Blob uploader with WebCrypto SHA‑256 |
| 6‑7 | Realtime multi‑cursor & live heads |
| 8   | “Publish” → Edge router → wildcard DNS |
| 9   | Basic analytics table + RLS |

---

## 10 · Why this can beat Replit/Loblow

* **Local‑first speed**, cloud sync in seconds.  
* **Branch‑centric UX**—dev‑friendly yet simple (“Draft” vs “Live”).  
* **Edge‑served previews** under personal sub‑domains.  
* **Single‑place security & cost control** via RLS + Storage.  

---

### Next steps

1. Implement domain objects & hashing library.  
2. Incrementally ship features per the sprint.  
3. Layer ElectricSQL/Replicache for offline PWA when ready.

---

**Happy building! 🚀**
