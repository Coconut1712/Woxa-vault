---
name: feedback-no-background-dev-servers
description: Never leave long-running dev servers (next dev, vite, etc.) running in background after a task ends
metadata:
  type: feedback
---

Never start a long-running dev server (e.g. `npm run dev`, `next dev`) with `run_in_background` and leave it alive after the task wraps up.

**Why:** A previous agent (woxa-vault-backend-builder) left a backgrounded Next dev server on port 3000 (PID 10227) after debugging a login bounce-back issue. When the user later tried `npm run dev` in their own terminal, Next refused to bind because the port was already held. The user had to ask an agent to clean it up before they could continue working. This is exactly the kind of friction that erodes trust.

**How to apply:**
- If a dev server is genuinely required to verify something, kill it before declaring the task done.
- Prefer `npm run build` + `tsc --noEmit` for verification — they exit on their own.
- If the user needs a dev server, let them launch it in their own terminal so they own the log stream and lifecycle. Don't pre-empt that.
- Same rule for any other persistent process: backend servers, watchers, tunnels, etc.
