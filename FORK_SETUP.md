# Anarlog Fork: Setup and Learning Notes

My personal fork of [`fastrepl/anarlog`](https://github.com/fastrepl/anarlog), the open-source local meeting notetaker (formerly "Hyprnote").

Each block is tagged **[grammar]** (transferable structure worth learning) or **[vocab]** (tool-specific, just paste or `man` it).

---

## Status, 2026-09-04

- **Fork synced.** `main` fast-forwarded 1485 commits to upstream `3e4b7f95a`, pushed to `origin`. Fork and upstream are identical; there are no local commits to lose.
- **Remote fixed.** `origin` pointed at the retired `wchen17` handle and now points at `onionviolet`. GitHub redirects the old URL, so this was silent rather than broken, which is exactly why it survived.
- **App installed and running:** release `desktop_v1.4.19`, signed and notarized by Fastrepl, Inc. (Team `6SLY7V277V`), checksum matched against the published `.sha256`. Nothing was compiled to get there.
- **Prior state found:** an older build (`1.0.47`, June) with two test sessions in `~/Library/Application Support/anarlog`. STT was set to `soniqo-parakeet-streaming` and the LLM provider was `ollama` with **no model selected**, so summaries never ran. Nothing was deleted.

## What this fork is for, set 2026-09-04

**Nothing that runs on this machine is gated behind a payment or a sign-in.**

Upstream is MIT and the local pipeline is mostly free already, but a few features that cost Fastrepl nothing to run are locked client-side. The rule this fork applies, written once in `apps/desktop/src/auth/local-entitlements.ts`:

> A feature is billable only when using it consumes Anarlog's servers.

So **Sync, Teams and the Cloud API stay gated**, because they are served by someone else's infrastructure and unlocking them would only produce confusing failures. **Dictionary, app icons and Automations are ungated**, because they execute here, against local models or against the user's own Linear, Notion and GitHub credentials.

`branch: local-first-no-gates`

| Feature | Upstream | Here | Why |
|---|---|---|---|
| Dictionary | Pro | free | Feeds STT keyword biasing and the local title and enhance transforms |
| App icon | Pro | free | Cosmetic, resolved from bundled assets |
| Automations | Pro | free | Runs on this machine against the user's own third-party accounts |
| Sync, Teams, Cloud API | Pro | Pro | Anarlog's servers do the work |

**One finding worth the whole patch: Automations were gated on a login, not just on payment.** Their controls waited on `billing.isReady`, which is derived from a query that is disabled without a session, so it never resolves while signed out and the buttons stayed dead. An ungated feature cannot wait on billing claims, so `billingReady` now short-circuits.

**Verified, and the honest limits.** `pnpm -F desktop typecheck` clean, `oxlint` clean with no new warnings against a 206-warning baseline, `dprint check` clean, `i18n:check` clean, and 3,927 desktop tests pass. Ten `devtools-bar` tests fail, and they fail identically on unmodified upstream, so they are not from this change. **The front end now builds for real:** `turbo build --filter=@anlg/desktop` succeeds, so this change compiles into a production bundle and not only into a type check. **The Rust side is still uncompiled** because the Metal compiler is missing, and nobody has seen the ungated settings running in the app.

## Rebuilding without the ceremony

```bash
./scripts/dev-install.sh            # build release, sign, install, relaunch
./scripts/dev-install.sh --debug    # much faster build, slower app
./scripts/dev-install.sh --sync     # fast-forward from upstream first
```

It builds, signs with a stable identity, quits the running copy, installs to `/Applications/Anarlog Dev.app`, strips quarantine and relaunches. It also swallows the one expected failure: `tauri build` exits non-zero because it cannot sign an updater artifact without `TAURI_SIGNING_PRIVATE_KEY`, and that step runs **after** the bundle is written, so a bundle on disk means the build itself succeeded.

### Keeping permissions across rebuilds, which is the point of the signing step

macOS records a microphone or system-audio grant against an app's **code signing identity**, not its path. A locally built app is ad-hoc signed and its identity changes with every build, so each rebuild looks like a brand new app and the grants are gone. That is why a fresh build shows permissions as off no matter how many times you approve them.

Signing every build with one self-signed certificate fixes it, and costs nothing. **Done on this machine 2026-09-04**, and needed once per machine. Keychain Access can do it through Certificate Assistant, but the whole thing works from the shell with no password prompt:

```bash
cat > cs.cnf <<'CNF'
[ req ]
distinguished_name = dn
x509_extensions = v3_cs
prompt = no
[ dn ]
CN = Anarlog Dev Self-Signed
[ v3_cs ]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
subjectKeyIdentifier = hash
CNF

openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout key.pem -out cert.pem -config cs.cnf

# The legacy algorithms are required. macOS cannot read the PKCS#12 defaults
# OpenSSL 3 writes, and reports it as "MAC verification failed (wrong
# password?)", which sends you hunting for a password problem that is not there.
openssl pkcs12 -export -inkey key.pem -in cert.pem \
  -name "Anarlog Dev Self-Signed" -out identity.p12 -passout pass:CHANGEME \
  -macalg sha1 -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES

security import identity.p12 -k ~/Library/Keychains/login.keychain-db \
  -P CHANGEME -T /usr/bin/codesign

# Trust it for code signing ONLY. Skip this and the import still succeeds while
# `find-identity -p codesigning` keeps reporting zero valid identities.
security add-trusted-cert -r trustRoot -p codeSign \
  -k ~/Library/Keychains/login.keychain-db cert.pem

security find-identity -v -p codesigning
```

**Then delete `key.pem` and `identity.p12`.** The private key lives in the keychain now, and this is the one part of the setup with a real downside: anything signed with that key is code this Mac trusts, so a leaked copy matters. The trust granted above is scoped to code signing and to this user account, not system-wide and not to TLS.

`dev-install.sh` picks the identity up automatically and warns rather than failing when it is absent. Override the name with `ANARLOG_SIGN_IDENTITY`.

**[vocab] The step everyone misses is the trust one.** Importing a certificate does not make it usable for signing. A self-signed certificate has nothing vouching for it until you say so yourself.

**[grammar] Identity, not location, is what the OS trusts.** The same principle explains why moving an app does not lose its permissions while rebuilding it does, and why the notarized App Store build never asks twice.

**The escape hatch stays regardless.** This fork adds a `Continue anyway` button to the onboarding permissions step, because upstream advances only on a successful probe and offers no button at all, which strands the user when detection is wrong.

### A real self-updater, if it is ever worth it

The app already carries updater plumbing, which is why the build asks for `TAURI_SIGNING_PRIVATE_KEY`. Pointing it at this fork takes four steps: generate a keypair with `pnpm tauri signer generate`, put the public key in the desktop `tauri.conf.json` updater block, set the private key as `TAURI_SIGNING_PRIVATE_KEY` when building, and publish the `.tar.gz` plus a `latest.json` to this fork's GitHub releases with the updater endpoint pointing there.

**Worth doing only for a second machine.** On the machine that compiles the code, `dev-install.sh` is already faster than any update check, and an updater adds a release-publishing step to every change. Build it when there is somewhere else to install to.

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

0. **Ungate diarization, which looks like a product gate rather than a technical limit.** `diarize_samples` in `crates/transcribe-soniqo/src/lib.rs:145` refuses every model except `ParakeetBatch`, and Parakeet has no Chinese, so the app gives speaker labels **or** Mandarin and never both. **But the function takes `samples: &[f32]`, raw audio.** Diarization here is `pyannote-rs`, which clusters speaker embeddings acoustically and never sees a word, so it is language-independent by construction. The refusal is a policy line, not a capability line.

   **Unverified and this is the part to test:** `model_id` is still handed to the Swift bridge, and `lib.rs:80` prepares the diarization cache only for `ParakeetBatch`, so the Swift side may validate the id or expect that cache. Whether the gate can simply widen, or needs the cache path generalized too, is unknown until someone tries it. **Payoff if it works: speaker labels on Mandarin and on Whisper Large V3, which is the one thing this fork's users cannot currently get anywhere in the app.**

1. **Vault wiring.** `crates/storage/src/obsidian.rs` already reads `obsidian.json` and lists local vaults, and `crates/storage/src/vault/` writes into one. This is the closest thing to the actual workflow: meeting in, markdown on disk, processed the same day. **Do not point it at the planning repo.** Raw transcripts are unprocessed material and the vault's own capture rules say they never live there; give it a separate folder outside the git repo.
2. **Model disk management.** `delete_model` exists in `crates/transcribe-soniqo/src/lib.rs` and there is still no UI flow for reclaiming the space. Small, self-contained, visible.
3. **The multilingual allow-list, now cosmetic.** Below, kept because the reasoning is still a good read of a code gate.
4. **Done: the local ungating above.**

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
| **Full Xcode** | **NO. `xcode-select -p` still reads `/Library/Developer/CommandLineTools`** | **Required to build the Rust side.** The blocker is narrower than it looked: `swift` and `swift-package` **are** in the current Command Line Tools, but `xcrun --find metal` fails, and `crates/transcribe-soniqo/build.rs` panics outright with no fallback when it cannot find a Metal compiler |
| Rust via `rustup` | 1.96.0 | the core and engine crates |
| Node.js | v26.4.0 | the TypeScript front end |
| pnpm | 11.9.0 | front-end dependencies |
| Ollama | yes, `qwen3.5:4b` (3.4 GB) | the summarizer. The app calls it over an OpenAI-compatible endpoint |

**[grammar] One idea, four tools:** a package manager is always "a manifest plus a tool that installs what the manifest lists." `cargo` reads `Cargo.toml`, `pnpm` reads `package.json`, same as `pip`, `brew`, `apt`. Learn the pattern once.

**Unblocking the Rust build, walked end to end on 2026-09-04.** Four steps, and **only one of them needs a password**, which is the opposite of what the first draft of this file predicted.

```bash
# 1. Install Xcode from the App Store. Xcode 26.6 is only 3.5 GB, not the 15 GB
#    older guides quote: SDKs and simulator runtimes are separate downloads now.

# 2. The one command that needs sudo. Nothing links until it runs, not even cc.
sudo xcodebuild -license accept

# 3. Undocumented prerequisite. xcodebuild cannot run at all until it installs
#    CoreSimulator into /Library/Developer. No password needed.
xcodebuild -runFirstLaunch

# 4. The Metal compiler, 688 MB. No password needed.
xcodebuild -downloadComponent MetalToolchain

# Verify by EXECUTING it, not by locating it:
xcrun metal --version
```

**`sudo xcode-select` is not needed.** `metal_developer_dir()` in `build.rs` probes `/Applications/Xcode.app/Contents/Developer` itself and passes it as `DEVELOPER_DIR` to the Metal commands, so the active developer directory can stay on the Command Line Tools.

**[grammar] Finding a tool is not the same as being able to run it.** `xcrun --find metal` returns a path as soon as Xcode is installed, because the wrapper binary ships with Xcode while the compiler behind it is a separate asset. That path proves nothing. `xcrun metal --version` executes the thing and is the only check worth trusting. The same distinction applies to any `which`-style lookup.

**Step 3 is named nowhere useful.** Anarlog's panic message tells you to run step 4, Apple's own error for step 4 tells you to run step 3, and nothing tells you step 2 comes first. The order above is the one that works.

Then, and only then:

```bash
cargo check -p transcribe-soniqo         # the crate that needs Metal, ~2 min cold
cd apps/desktop && pnpm tauri build --debug
```

**Use `pnpm tauri build`, not `pnpm tauri:build`.** The `tauri:build` script is a bare `tauri build`, while the `tauri` script wraps it in `dotenvx run --ignore MISSING_ENV_FILE`, which is what lets a release build proceed without the Supabase and Stripe env files. `--debug` skips release optimization and is enough to see a change running.

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
pnpm exec turbo build --filter=@anlg/desktop   # front end only, no Xcode needed
cd apps/desktop && pnpm tauri:dev              # compiles the Rust core, launches in dev mode
```

**Build the front end with turbo, not with `pnpm -F desktop build`.** The direct call skips the dependency graph, so `@anlg/ui` never runs its tailwind step and the build dies on an unresolved `@anlg/ui/globals.css` import from `main.tsx`. The error names a CSS file and the cause is a missing build order, which is why it reads as unrelated to whatever you just changed.

- The first Rust build takes 10 to 15 minutes because every dependency compiles once. Later builds only recompile what changed. **[grammar: compilers cache]**
- `tauri:dev` passes `--ignore MISSING_ENV_FILE`, so local transcription runs with no cloud keys and the Supabase and Stripe parts of the monorepo stay dark.
- Production build: `pnpm tauri:build`.

## 3. Troubleshooting

- **`resolving Soniqo Swift dependencies failed`, or a `BuildServerProtocol.framework` dyld error:** you have only the Command Line Tools. Install full Xcode and re-point `xcode-select`. This is the first-build blocker and it is still unresolved on this machine.
- **`error[E0463]: can't find crate for ref_cast_impl`, and the same for `serde_derive`, `thiserror_impl`, `strum_macros`, `tracing_attributes`.** Earlier notes here called this a parallel-build race and told you to run it again. **That was wrong, corrected 2026-09-04.** Running it again surfaces the real message underneath: `dlopen(...libserde_derive....dylib): mis-aligned LINKEDIT string pool`. The proc-macro dylibs in `target/` were built by an older toolchain and the current linker refuses to load them, so every macro-dependent crate fails at once. **Fix: `cargo clean`.** It removed 508 MB here and the build was healthy immediately after. **[grammar] When several unrelated crates fail the same way at the same moment, suspect one shared input rather than several coincidences.**

**But the shared input is not always the cache, and assuming it was cost an hour on 2026-09-04.** The same error came back on dylibs that had just been built, with the failing crate name changing every run (`time`, then `phf`, then `thiserror`). The real cause was that **Xcode was installing in the background and the toolchain was being replaced underneath the running compiler.** Once the install finished, every link failed cleanly instead, with `cc` exiting 69 and saying the Xcode license had not been agreed to.

**So: do not debug a Rust build while Xcode is installing.** Wait for the install, accept the license, then judge the build. A moving toolchain produces failures that look like a dozen unrelated bugs, and the first plausible explanation will be wrong.
- **`failed to load manifest for workspace member plugins/flag`.** Upstream deleted `plugins/flag`, `plugins/network` and `plugins/webhook`, but pnpm had left a bare `node_modules` directory inside each. Cargo's `plugins/*` glob still matched those empty directories and `cargo metadata` refused to load the whole workspace. **Fix: delete the leftover directories.** Nothing in them is tracked by git. **[grammar] A glob in a manifest matches the filesystem, not the repository**, so anything a tool leaves behind after an upstream deletion becomes a phantom workspace member.
- **pnpm `packageManager` mismatch warning:** harmless. `corepack use pnpm@<pinned>` to silence it.
- **Rust version:** `rust-toolchain.toml` pins the version and `rustup` fetches it automatically inside the repo.
- **Piped builds lie about success.** `cargo build | tail` reports `tail`'s exit code, not cargo's. Use `set -o pipefail`, then read `${PIPESTATUS[0]}`. **[grammar] A pipeline's status is its last command's status unless you say otherwise.**
- **Never `cp -R` a new `.app` over an old one.** The copy merges directories, stale files from the old version survive, and `codesign -v --strict --deep` then reports `a sealed resource is missing or invalid`. Move the old bundle aside and use `ditto` instead. **[grammar] An app bundle is a directory, so every directory-merge rule applies to it.**
- **Verify a download before opening it:** `shasum -a 256 file.dmg` against the published `.sha256`, then `spctl -a -vvv <app>` to confirm Gatekeeper sees a notarized Developer ID. **[vocab]**
