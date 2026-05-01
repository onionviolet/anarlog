# Product Positioning

All content created under this directory must follow the positioning below. Source of truth: the **anarlog wiki** at `~/charpedia/anarlog/` (canonical pages: `product.md`, `marketing.md`, `community.md`, `history.md`).

> If this doc and the wiki ever disagree, **the wiki wins.** Update this doc to match.

## What anarlog is

**The open-source AI meeting notetaker.** MIT licensed. Self-hostable. BYOK.

Tagline: **"Granola, rearranged."** (`anarlog` = anagram of `granola`)

Records meetings → transcribes locally → generates notes. Your data never leaves your infrastructure unless you choose to send it.

- **Repo:** [`fastrepl/anarlog`](https://github.com/fastrepl/anarlog) (8,331⭐ at rename, history preserved)
- **Site:** `anarlog.so`
- **License:** MIT (relicensed from GPL during Operation Supernova)
- **Status:** Maintenance mode + autopilot. Solo-maintained by John in the margins. Cortana watches for market pull.

## What anarlog is *not*

- **Not the team's flagship.** The flagship is [Char](https://char.com) — separate product, productivity-focused, private repo, managed SaaS for individuals/founders.
- **Not commercially load-bearing.** Doesn't need to "succeed" by revenue metrics. No paid acquisition. No SEO calendar. No PLG funnel.
- **Not getting major new features.** Bug fixes, security, build issues, community PRs.

## Why anarlog exists

Three reasons, in this order:

1. **A promise to the 8.3k stargazers:** "we'll never close our repos." anarlog is the open-source notetaker that fulfills it.
2. **OSS goodwill** earned over Hyprnote → Char → unsigned-char → anarlog. Killing the repo kills the goodwill.
3. **A market test:** is there enterprise self-host pull for an open-source AI notetaker? If yes → John hires someone to own it. If no → anarlog stays maintenance OSS forever. **No team time on this until pull is real.**

## Core thesis

The architecture anarlog exists to oppose: tools like Granola, Otter, Fireflies take your meetings, send them to their cloud, store them in their database, and rent access back to you. **anarlog is the inverse.** The audio stays on your machine. The notes are markdown files in a folder you control. You bring your own keys, run local models, or self-host the whole stack. The repo is open-source and auditable. If we disappeared tomorrow, your notes would still be there, in a format you can open in any editor, forever.

> *"Privacy is a feature talk. Ownership is the whole thing."* — anarlog.so/blog/char-is-now-anarlog

**Ownership is the frame.** Privacy and self-hosting are *consequences* of ownership, not the lead. Don't write fear-shaped content.

## Target audience (in this order)

The wiki narrows this to a tighter set than legacy Char positioning:

1. **Developers, technical founders, platform/infra engineers** — the readers of dev-tool landings. They starred the repo. They're the primary audience.
2. **Eng leads + security-curious devs at compliance-heavy orgs** — the enterprise self-host pull we're testing for. Watch for: `.com` email stargazers, SOC2/HIPAA questions, "can our team self-host this" inbound.
3. **Existing Char 1.0 users** migrating to a maintained OSS home.
4. **Privacy-conscious professionals** (lawyers, healthcare, finance) — real, but secondary. They arrive *because* of ownership, not because of fear marketing.
5. **People whose org banned cloud notetakers** (Otter, Granola, Fireflies, ChatGPT meeting notes).
6. **Open-source enthusiasts** who already prefer files-over-apps stacks (Obsidian, plain markdown, BYOK).

## Core features

**Real-time transcription**
- System audio capture (no bots joining calls, no calendar permissions)
- Live transcript generated while user takes notes

**AI summary**
- Combines user notes + transcript into structured summaries
- User controls which AI processes their data

**Your choice of stack**
- Bring your own API keys (OpenAI, Deepgram, Anthropic, Mistral, Gemini, OpenRouter, Azure)
- Run local models via Ollama or LM Studio
- Or self-host the whole thing — Docker one-liner, your infra, end-to-end

**Plain markdown files**
- Stored locally on user's device
- Works with any tool (Obsidian, Notion, VS Code, vim)
- Future-proof format
- Zero lock-in

**Additional capabilities**
- Floating panel for quick recording controls
- Keyboard shortcuts
- Custom templates for different meeting types
- AI chat to query transcripts
- Search across all meetings
- Import existing recordings/transcripts
- 45+ language support

## What makes anarlog different

**vs. cloud AI notetakers (Granola, Otter, Fireflies, tl;dv, Read.ai):**
- Plain markdown files instead of proprietary databases
- System audio capture instead of meeting bots
- Your choice of AI provider instead of vendor lock-in
- Self-host or BYOK instead of cloud-only
- Open-source MIT instead of black-box SaaS

**vs. Char (the sister product):**
- anarlog is the OSS notetaker for orgs/devs who want to self-host
- Char is managed SaaS for individuals and founders who want it to just work
- Same lineage, different audiences, different licenses, different cadences. **Don't compete; complement.**

## Brand voice

**We are:**
- **Code-first.** The hero is an install command, not a hero image.
- **Dry and terse.** No "AI-powered." No "transform your workflow." No testimonials. No avatars. No "Trusted by [logos]."
- **Direct and honest.** Maintenance mode is named explicitly. Slow releases are named explicitly. We don't promise features.
- **Engineering-minded.** Respects reader intelligence. Assumes they can read a Dockerfile.
- **Pro-ownership, anti-lock-in.** Frame in terms of control, not fear.

**We are not:**
- Corporate or overly polished
- Privacy-paranoid (we lead with ownership; privacy follows)
- Feature-bloated
- A SaaS funnel
- Trying to be everything to everyone

## Key messaging themes

1. **Ownership** — files on your device, repo on GitHub, license you can audit
2. **Self-host** — Docker one-liner, your infra, your stack
3. **BYOK** — your AI provider, your keys, your retention policy (or none)
4. **No lock-in** — markdown files, open format, portable forever
5. **Sister to Char** — mention once, don't dominate. anarlog is for self-hosters; Char is for individuals/founders.

## What we're building toward

A maintenance-mode OSS project that stays alive, honest, and useful for the community that vouched for it. If the market test surfaces real enterprise self-host pull — the contingency plan exists in `~/charpedia/anarlog/marketing.md`. Until then, we don't build apparatus we don't need.

## Critical reminders

- **Name:** Always use **"anarlog"** (lowercase). Not "Char" — Char is a separate product at char.com. Not "Hyprnote" — that's two names ago, and we reached an agreement that retired it. Not "unsigned-char" — that was the GitHub-org-rename interim name during Operation Supernova.
- **Tone:** Direct, dry, engineering-minded, respects reader intelligence.
- **Frame:** Ownership > privacy. Control > fear. Self-host > "secure cloud."
- **Avoid:** Generic productivity language, corporate marketing speak, fear-based privacy messaging ("Is X safe? 😱"), feature lists that read like a SaaS comparison grid.
- **Cross-links:** When mentioning Char, use `https://char.com` (full URL, mentioned once, doesn't dominate).

## Source of truth

| Topic | Canonical doc |
|---|---|
| Product status, naming, what it is | `~/charpedia/anarlog/product.md` |
| Marketing posture + landing-page rules | `~/charpedia/anarlog/marketing.md` |
| Community / contributor voice | `~/charpedia/anarlog/community.md` |
| Naming arc + Operation Supernova | `~/charpedia/anarlog/history.md` |
| Maintenance bar (do fix / won't fix) | `~/charpedia/anarlog/maintenance.md` |
| Cortana's autopilot duties | `~/charpedia/anarlog/autopilot.md` |

When updating positioning, update the wiki first, then propagate here.
