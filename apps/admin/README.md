# apps/admin: admin console (frontend, built last)

Next.js (App Router), server-rendered, on its own domain with a strict CSP and the fixed Admin theme. Phone and desktop layouts come from the same pages. Admins manage accounts; they can never read a vault.

**Status:** not started. Its backend (`/admin/*` in `apps/api`) is built first.

**Read before building:** `docs/SPEC.md` section "Admin console on phone and web". Mockups: the Admin console page of the [Rahasya screens](https://claude.ai/artifact/QgvBxcyArdcvGHwvrYktcG) canvas.

| Route | Screen | Permission |
| --- | --- | --- |
| `/signin` | A1 Sign in (email, password, hardware security key) | none |
| `/users` | A2 Users | view users or manage users |
| `/recovery`, `/recovery/[id]` | A4 Recovery requests and detail | start recovery |
| `/audit` | A3 Audit log | view audit log |
| `/admins` | A5 Admins and roles | manage admins (others see it read-only) |
| `/policies`, `/settings` | Policies, settings | Owner or super admin |

Sessions last 15 minutes and only allow-listed IPs can sign in.
