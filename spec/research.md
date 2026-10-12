# Research — InfiniSynapse platform & hackathon

> Filed 2026-10-12. All findings verified from live sources on this date.

## Hackathon (https://infinisynapse.com/en/hackathon/2026)
- Vibe Coding Hackathon 2026, online, Oct 10–31 2026 Pacific (ends Nov 1 06:59 UTC).
- $3,000 pool: 1st $900 ×1, 2nd $600 ×2, 3rd $300 ×3.
- 6 tracks: Education, Retail & Replenishment, Hit-product Analysis, SMB Operations, Growth for Operators, Open Industry.
- Registration: Luma — https://luma.com/tf5i5e6l
- Judging (from event listings, not the official page): scene value 40%, technical completeness 35%, innovation 25%; stars don't count. Confirmed judge: William Zhu (co-founder).
- Submission details NOT published yet as of 2026-10-12.
- Rule: working data-backed app, inputs in → decision/action out. Synthetic data allowed if clearly labeled.

## Platform (Vibe Coding Guide, mirrored at github.com/octo-o-o-o/infinisynapseassistant)
- Architecture: app BFF → Server API (SSE + task endpoints) → Agent runtime (InfiniSQL) → results back.
- Key endpoints (`https://app.infinisynapse.com`, header `Authorization: Bearer <key>`):
  - `GET /api/ai/events?connId=` — SSE subscribe (first)
  - `POST /api/ai/message` — `{type: newTask|askResponse|...}` (second)
  - `GET /api/ai_task/list`, `/api/ai_database/list`, `POST /api/ai_database/enabled`
- Response envelope: `{code, message, data}`; `code` 1101/1105 = invalid/expired key.
- Databases/RAGs must be listed + enabled BEFORE `newTask`.
- API key: app.infinisynapse.com/tasks → gear → API Key Management → Create. Hackathon keys get 500 credits.
- Key verified working 2026-10-12 via `GET /api/ai_task/list` → `{"code":200,"message":"success"}`.
- Vibe Coding Guide: https://infinisynapse.com/en/docs/InfiniSynapse%20Vibe%20Coding%20Guide
- Discord: https://discord.gg/EUzmFn6RJx
