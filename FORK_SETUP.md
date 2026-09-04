# Anarlog Fork: Setup and Learning Notes

My personal fork of [`fastrepl/anarlog`](https://github.com/fastrepl/anarlog), the open-source local meeting notetaker (formerly "Hyprnote").

Each block is tagged **[grammar]** (transferable structure worth learning) or **[vocab]** (tool-specific, just paste or `man` it).

---

## Status, 2026-09-04

- **Fork synced.** `main` fast-forwarded 1485 commits to upstream `3e4b7f95a`, pushed to `origin`. Fork and upstream are identical; there are no local commits to lose.
- **Remote fixed.** `origin` pointed at the retired `wchen17` handle and now points at `onionviolet`. GitHub redirects the old URL, so this was silent rather than broken, which is exactly why it survived.
- **App installed and running:** release `desktop_v1.4.19`, signed and notarized by Fastrepl, Inc. (Team `6SLY7V277V`), checksum matched against the published `.sha256`. Nothing was compiled to get there.
- **Prior state found:** an older build (`1.0.47`, June) with two test sessions in `~/Library/Application Support/anarlog`. STT was set to `soniqo-parakeet-streaming` and the LLM provider was `ollama` with **no model selected**, so summaries never ran. Nothing was deleted.

## The original goal is mostly obsolete, and that is a good outcome

**The fork existed to unlock multilingual on-device speech-to-text**, because the only two models upstream exposed were Parakeet variants covering 25 European languages and no Mandarin.

**Upstream shipped two independent answers in the meantime.** `crates/local-stt-core/src/lib.rs` now offers six models, not two:

| Model | Languages | Live? | Download | RAM the app wants |
|---|---|---|---|---|
| Soniqo Parakeet Streaming | 25 European | yes | 120 MB | 8 GB |
| Soniqo Parakeet Batch | 25 European, with speaker labels | no | 632 MB | 16 GB |
| **Apple Speech** | whatever macOS has installed, **including Simplified and Traditional Chinese** | yes | **0, macOS owns the assets** | 8 GB |
| Parakeet V2 (Argmax) | English only | no | 476 MB | 8 GB |
| Parakeet V3 (Argmax) | English and European | no | 494 MB | 8 GB |
| **Whisper Large V3 (Argmax)** | broad multilingual | no | 626 MB | 16 GB |

So **Mandarin is now two clicks in the model picker, not a code change.** Apple Speech is the cheap one (nothing to download, realtime, and it is the same on-device engine the macOS 26 Notes app uses); Whisper Large V3 is the accurate one for a recorded file after the fact.

**[grammar] The lesson worth more than the feature:** a fork whose whole purpose is unlocking something upstream is deliberately holding back is a race against upstream, and upstream usually wins. Before reviving any fork, diff the goal against today's upstream, not against the upstream you forked. This one was 1485 commits stale and the goal had already been met twice.

## What is still worth forking, ranked

1. **Vault wiring.** `crates/storage/src/obsidian.rs` already reads `obsidian.json` and lists local vaults, and `crates/storage/src/vault/` writes into one. This is the closest thing to the actual workflow: meeting in, markdown on disk, processed the same day. **Do not point it at the planning repo.** Raw transcripts are unprocessed material and the vault's own capture rules say they never live there; give it a separate folder outside the git repo.
2. **Model disk management.** `delete_model` exists in `crates/transcribe-soniqo/src/lib.rs` and there is still no UI flow for reclaiming the space. Small, self-contained, visible.
3. **The multilingual allow-list, now cosmetic.** Below, kept because the reasoning is still a good read of a code gate.

## The old code change, for reference only

**The file moved:** `crates/transcribe-soniqo/src/lib.rs` split, and the gate now lives in **`crates/transcribe-soniqo/src/model.rs`**.

Every model is implemented and downloadable. Two constants decide what you ever see:

```rust
// model.rs:80
const SELECTABLE: &'static [Self] = &[Self::ParakeetStreaming, Self::ParakeetBatch];
```

`Omnilingual` is implemented, 300 MB, multilingual, and hidden purely by that list. Adding it is one line, plus the test at `crates/local-stt-core/src/lib.rs:107` which asserts `SUPPORTED_MODELS` matches `selectable()` and will fail until both sides agree. **[grammar] A failing test after a one-line change is usually the codebase telling you the value has a second home. Find the other home rather than editing the assertion.**

The Qwen3 gate is the more interesting bug:

```rust
// model.rs:146
pub const fn is_available_on_current_platform(self) -> bool {
    cfg!(all(target_os = "macos", target_arch = "aarch64")) && !self.requires_macos_15()
}
```

`requires_macos_15()` is true for both Qwen3 models, so `!` makes them unavailable on **every** OS forever. The name promises a version check and the body performs a blanket exclusion. Fixing it honestly means a runtime version check, because `const fn` cannot ask the OS its version. **[judgment] Worth doing by hand, not by paste.** Note the ceiling first: this machine has 16 GB, `recommended_memory_bytes` asks 16 GB for Qwen3 Small and **32 GB for Qwen3 Large**, so the large one is out regardless of the gate.

---

## 0. Prerequisites, and which are actually required now

**Building is optional.** Releases ship almost daily and the app is a notarized download. Build only when changing code.

| Tool | Installed here | Needed for |
|---|---|---|
| Xcode Command Line Tools | yes | Rust's linker, the Tauri shell |
| **Full Xcode** | **NO. `xcode-select -p` still reads `/Library/Developer/CommandLineTools`** | **Required to build.** `crates/transcribe-soniqo/build.rs` calls `swift package` and `xcrun --find metal`, and neither the Swift Package Manager nor the Metal compiler works from the bare CLT |
| Rust via `rustup` | 1.96.0 | the core and engine crates |
| Node.js | v26.4.0 | the TypeScript front end |
| pnpm | 11.9.0 | front-end dependencies |
| Ollama | yes, `qwen3.5:4b` (3.4 GB) | the summarizer. The app calls it over an OpenAI-compatible endpoint |

**[grammar] One idea, four tools:** a package manager is always "a manifest plus a tool that installs what the manifest lists." `cargo` reads `Cargo.toml`, `pnpm` reads `package.json`, same as `pip`, `brew`, `apt`. Learn the pattern once.

To unblock a build later: install Xcode from the App Store (about 15 GB, and there is 120 GB free), then

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

**[judgment] `curl ... | sh` runs code you have not read.** rustup is trusted; the safe habit for anything else is `curl -O <url>`, read it, then run it.

## 1. The git workflow

- **Fork** = your copy on GitHub's servers (`onionviolet/anarlog`). You can push to it; you cannot push to someone else's.
- **Clone** = a copy on the laptop.
- **Remote** = a named URL. Convention: `origin` is your fork, `upstream` is the original. **[grammar]**

Staying current, which is the step that was skipped for two months:

```bash
git fetch upstream          # download their commits, change nothing locally
git merge --ff-only upstream/main   # move main forward, refuse if you have diverged
git push origin main
```

**[grammar]** `--ff-only` is the honest version of a sync. If you have local commits it stops instead of silently making a merge commit, which tells you the truth about your own history. `git pull` is `fetch` plus `merge` with that safety off by default.

**[grammar] Shallow clones bite here.** This clone was made with `--depth 1`, so it had no history to merge into. `git fetch --unshallow upstream` fills it in, and only then does a fast-forward work.

**[judgment] Never on shared branches:** `git reset --hard` discards uncommitted work, `git push --force` overwrites remote history. Both are permanent.

## 2. Build and run, when you do build

```bash
pnpm install
cd apps/desktop && pnpm tauri:dev     # compiles the Rust core, launches in dev mode
```

- The first Rust build takes 10 to 15 minutes because every dependency compiles once. Later builds only recompile what changed. **[grammar: compilers cache]**
- `tauri:dev` passes `--ignore MISSING_ENV_FILE`, so local transcription runs with no cloud keys and the Supabase and Stripe parts of the monorepo stay dark.
- Production build: `pnpm tauri:build`.

## 3. Troubleshooting

- **`resolving Soniqo Swift dependencies failed`, or a `BuildServerProtocol.framework` dyld error:** you have only the Command Line Tools. Install full Xcode and re-point `xcode-select`. This is the first-build blocker and it is still unresolved on this machine.
- **`error[E0463]: can't find crate for ref_cast_impl`:** a parallel-build race, not a real error. Run it again.
- **pnpm `packageManager` mismatch warning:** harmless. `corepack use pnpm@<pinned>` to silence it.
- **Rust version:** `rust-toolchain.toml` pins the version and `rustup` fetches it automatically inside the repo.
- **Piped builds lie about success.** `cargo build | tail` reports `tail`'s exit code, not cargo's. Use `set -o pipefail`, then read `${PIPESTATUS[0]}`. **[grammar] A pipeline's status is its last command's status unless you say otherwise.**
- **Never `cp -R` a new `.app` over an old one.** The copy merges directories, stale files from the old version survive, and `codesign -v --strict --deep` then reports `a sealed resource is missing or invalid`. Move the old bundle aside and use `ditto` instead. **[grammar] An app bundle is a directory, so every directory-merge rule applies to it.**
- **Verify a download before opening it:** `shasum -a 256 file.dmg` against the published `.sha256`, then `spctl -a -vvv <app>` to confirm Gatekeeper sees a notarized Developer ID. **[vocab]**
