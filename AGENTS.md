# Working with this workflow

This is a [3B](https://se-demo.3b.dev) workflow. 3B is a workflow automation platform where you build workflows from linked steps. Each step's stdout flows to linked downstream steps via stdin.

## File structure

```
README.md                 workflow-level description in markdown
<Step Name>/              one directory per step
  README.md               step description in markdown (first file users see)
  config.toml             step config (color, output, route, route_auth, route_type, title, cron, email_address, links, connectors, timeout, retry_seconds)
  Dockerfile              build/run config (template-provided; see below)
  ...                     entry point and other source files (vary by template)
```

Each top-level directory is a step. The step's name is the directory name. Step names must be unique within a workflow.

## Step templates

Steps are based on one of five templates:

| Template   | Entry point  | Notes                                                                                |
|------------|--------------|--------------------------------------------------------------------------------------|
| shell      | `script.sh`  | Plain shell script.                                                                |
| python     | `script.py`  | Add dependencies to `requirements.txt` — don't `pip install` in the Dockerfile. |
| typescript | `script.ts`  | TypeScript (Bun). Add deps to `package.json` — the existing `./bun install` line picks them up. Don't run `bun add` in the Dockerfile. |
| react      | `App.tsx`    | React + Tailwind (`output = true`). Same dep rules as typescript.    |
| agent      | `agent.ts`   | A model-calling agent with tools and a run loop. Load the `building-agents` skill before using it. |

A step isn't limited to its single entry file. Add source files alongside the entry point (`App.tsx`, `script.ts`, `script.py`, `script.sh`, `agent.ts`) and import them from it — the entry point is what the runtime invokes.

### React template

Steps that output UI use the react template. It bundles a client-side React app with Tailwind.

- Default to one react step rendering the whole UI — don't split a single app's pages across multiple react steps. Multiple react steps are fine when they're genuinely separate apps (e.g. an admin dashboard alongside a public form).
- Don't put the react step downstream of a data-hydration step — that blocks the page until the upstream finishes. Render the shell immediately and `fetch` data from other route steps; the rendered page never sees stdin.
- For multi-page apps, use `BrowserRouter` from `react-router-dom` with `basename={window.__ROUTE_PATH__}` and relative `<Route>` paths (`/`, `/about`).
- Every rendered page must set a descriptive document title. Render `<title>…</title>` in the React tree, and give each route in a multi-page app its own title.
- A default favicon — a letter mark of the page title's first letter — is served automatically, so add a `<link rel="icon">` only to override it.
- Style with Tailwind utility classes — use the built-in color palette (`bg-gray-50`, `text-gray-900`) and spacing scale (`px-4 py-2`) instead of arbitrary values (`p-[12px]`).
- Load the `frontend-design` skill before writing any component; it carries the design direction.
- The bundle ships to the browser on every request, so don't reach for new libraries unless asked.
- When the user uploads an image or file to use, copy it in with `copyUploadToStep`, then import the copy at build time. Never rebuild an uploaded file: do not redraw an image as SVG, divs, canvas, or a grid of shapes, and do not retype its contents or paste them as a string literal.

## Code quality

You're writing enterprise software that runs unattended on someone's business.

Default to writing no comments. Add one only when the *why* isn't obvious from the code — a constraint, a workaround, a rule that would surprise a reader — and keep it to a sentence. Don't restate what the code does, don't number your steps (`// 1. Parse input`), and don't write comments about the edit you're making rather than the code as it rests (`// switched to the new client`, `// unchanged`).

Let failures reach the exit code. Exiting non-zero is the only way a step reports failure, and downstream steps run only after a step exits zero with output — so catching an error, logging it, and continuing reports success and feeds the rest of the workflow whatever partial output you wrote.

## README.md (workflow)

The root `README.md` describes the workflow as a whole. It's shown on the workflow's Readme tab. Don't open with a heading naming the workflow — the UI shows the name above. Just start explaining.

Cover what a reader needs to understand the workflow without reading every step. Skip whatever doesn't apply, and don't duplicate what the graph, Links tab, or Connectors tab already shows.

- **Purpose.** What this workflow exists to do, framed in business terms — who uses it and what problem it solves. A single sentence is often enough, but a paragraph is fine when the context needs it.
- **Triggers.** How the workflow kicks off — entry link(s), cron schedule, inbound email address, or upstream workflow. If multiple triggers exist, say which is the entry point and which are internal callbacks.
- **The flow.** A short narrative of what happens across the steps — the graph shows topology, the README explains the journey. "Fetch X, enrich with Y, branch on Z, notify on W."
- **Inputs and outputs at the workflow boundary.** What the caller provides (request body, query params, scheduled inputs) and what comes back or gets produced.
- **External services and connectors.** A summary across steps — the per-step READMEs cover details, the workflow README gives the at-a-glance picture.
- **Side effects.** Whether this workflow writes to external systems, sends notifications, or modifies shared state. Read-only vs read-write framing helps a lot.
- **Operational notes.** Common failure modes and what to do, where to find logs or dashboards, who owns it.
- **Pointers for common changes.** "To add a new filter rule, edit [`Filter/script.py`](Filter/script.py)." Help newcomers find the right step without reading every one.

Link to step files with relative paths — `[Filter/script.py](Filter/script.py)`. If the step name contains spaces, wrap the URL in angle brackets — `[GitHub webhook/script.ts](<GitHub webhook/script.ts>)`. The viewer turns those into in-app navigation.

Update the README when the workflow's purpose or structure changes materially. Skip pure refactors that don't change behaviour.

## README.md (step)

Every step should have a `README.md` explaining what the step does. Write it before the script; the same `bash` call as the scaffold is fine.

Don't open with a heading naming the step — the UI shows the step name above the README. Just start explaining.

There's no template to fill in. Markdown is rendered, including `mermaid` fences for diagrams.

Cover what a reader needs to understand the step. **The trigger is load-bearing** — name the HTTP route path for route steps, the cron expression for scheduled steps, the email address for email-triggered steps, or the upstream step otherwise. Also cover external services and APIs the step talks to (with the endpoints), connectors it uses, and the shape of its input or output when that isn't obvious. Skip whatever doesn't apply to this step.

Link to source files with relative paths the way you would in a GitHub README — `[script.py](script.py)` for a sibling file in the same step, `[the Decode step's script](../Decode/script.py)` for a file in another step. If a step name contains spaces, wrap the URL in angle brackets — `[the GitHub webhook step's script](<../GitHub webhook/script.ts>)`. The viewer turns those into in-app navigation.

Update the README when the step's behaviour materially changes. Skip pure refactors that don't change behaviour.

## config.toml

```toml
color = "sky"                                      # pink, purple, teal, green, orange, red, or sky
output = true                                       # step's stdout is the HTTP response (omit if false)
route = "/begin"                                    # HTTP trigger route. "/" is the space’s root page (see below)
route_auth = "space"                                # route authentication mode (see below; defaults to "space")
route_type = "webpage"                              # mark this route for the Links page — see "Route type"
title = "New hire onboarding"                       # the link’s heading on the Links page
cron = "0 * * * *"                                  # schedule expression (e.g. "0 * * * *" for hourly)
email_address = "support"                           # inbound email trigger — see "Email triggers"
timeout = 60                                        # execution timeout in seconds (1–300, default 45)
retry_seconds = [1, 2, 3]                           # wait before each whole-step retry after an unsuccessful command exit
links = ["Transform", "Notify"]                     # downstream step names this step feeds into
connectors = [{ name = "slug", type = "type" }]     # connectors (managed by tooling, not edited by hand)
```

All fields except `color` are optional. Omit a field rather than setting it to an empty value. Routes must be unique within the space — pick something specific to this workflow (e.g. `/checkout-submit`, not `/submit`). `route = "/"` is the one exception, and you should reach for it rarely: it serves the step at the space’s root and acts as a catch-all for any path that doesn’t match a more specific route, so a space can have at most one root step. Only use it when the user explicitly wants a website with a homepage for their space — otherwise give the workflow its own specific route (e.g. `/checkout`) and leave the root free. Prefer short timeouts; only raise from the 45-second default for genuinely slow work like large data processing or slow external APIs.

`retry_seconds = [1, 2, 3]` reruns a workflow step when its command exits unsuccessfully, waiting 1, then 2, then 3 seconds before the next attempts, for four attempts in total. Each attempt starts the whole step again and can repeat side effects, so add it only when the user requests retries and replay is safe; builds, step tests, timeouts, out-of-memory failures, and missing commands remain terminal under this setting, while temporary 3B failures use separate automatic recovery.

### Route type

`route_type` surfaces a route on the Links page and tells the UI how to present it. Set it on the entry point a person should reach first (the public webpage, the main API endpoint, the primary webhook). Leave it off internal helpers and secondary endpoints — they still work, they just stay off the Links page until the user opts them in. Each workflow with at least one route **must** set `route_type` on at least one of them — for a single-entry workflow that's the one entry point. When a workflow is a programmatic API with several endpoints meant to be called directly, mark **every** one of those endpoints `route_type = "api"` (not just one); they all belong on the Links page and in the workflow's published API docs. Still leave it off internal callback and helper routes.

Give every route you mark with `route_type` a `title` — a short, human name (e.g. `Checkout`, `New hire onboarding`) shown as its heading on the Links page.

| Value       | When to use                                                                                  |
|-------------|----------------------------------------------------------------------------------------------|
| `"webpage"` | HTML pages a person opens in a browser (the response is rendered as a thumbnail).          |
| `"api"`     | Machine-readable endpoints called programmatically — JSON responses, form submission handlers, and similar. |
| `"webhook"` | Endpoints that receive events from an external service (Slack, Stripe, GitHub, etc.).     |
| `"other"`   | Anything that doesn't fit the categories above (file downloads, redirects, RSS, OAuth callbacks, etc.). |

### Route authentication

Steps with a `route` are authenticated by default — omit `route_auth` and the step is treated as `route_auth = "space"`. **Keep routes private unless the user asks otherwise**; NEVER EVER set `route_auth = "public"` on your own initiative.

| Value             | Who can access                                                                                                |
|-------------------|---------------------------------------------------------------------------------------------------------------|
| `"space"`         | Only members of the workflow's space (default when unset).                                                    |
| `"tenant"`        | Any authenticated member of the tenant.                                                                       |
| `"sso"`           | Any external end user who can sign in against the tenant's SSO provider. No account or membership is created. Use for customer-facing pages gated to a company's SSO, not to 3B members. |
| `"external_id"`   | Anyone with the route's unguessable id. Default for webhooks, callback URLs, and anything called by an external service. |
| `"connector"` | Other workflows in the tenant whose calling step uses a workflow-backed connector pointing at *this* workflow. Set this on the specific routes you want to expose to other workflows after the user "exposes this workflow as a connector." |
| `"public"`        | Anyone on the internet, no credential. Only when the user has explicitly asked for a truly open endpoint.    |

`"space"` and `"tenant"` name who is allowed in; the credential is chosen by the client's shape. They accept a session cookie (browser), an `Authorization: Bearer <key>` API key, or an `Authorization: Bearer <access token>` issued by 3B's authorization server — external MCP clients (claude.ai, ChatGPT connectors, Claude Code) obtain one through a discovery and consent flow, which is how a workflow is published as an MCP server: pick the bar, and MCP clients connect to the route's URL with no further configuration. 3B strips the bearer before the step runs so it never reaches step code. `"sso"` sends browser visitors through the tenant's SSO provider (SAML or OIDC). When the tenant has its own SSO provider registered with a pinned email domain (the built-in 3B sign-in doesn’t count), an `"sso"` route also accepts OAuth access tokens and advertises the same discovery flow as the scoped bars, but consent authenticates against that provider instead of a 3B account and trusts only emails on the pinned domain — this is how an MCP server is published to an audience whose users are not 3B members. `"external_id"` looks for the id in the `external_id` query parameter. **Don't invent the id** — write `route_auth = "external_id"` with no value and the server mints one on first save, leaving `route_auth = "external_id:abc123…"` in the file. The id stays stable across edits. `"connector"` is verified via an `X-3B-Connected-App-Auth` header the proxy injects automatically on the caller side — you never need to set the header yourself.

`"space"`, `"tenant"`, and `"sso"` routes carry a spoof-proof `x-3b-authenticated-email` header (the IdP's email, for `"sso"`; the consenting user's email, when the caller presented an OAuth access token). It's absent on `"public"` and `"external_id"` routes.

```toml
# Inbound webhook — server fills in the id on first save
route = "/webhook"
route_auth = "external_id"
```

```toml
# Any tenant member (browser or API key)
route = "/internal"
route_auth = "tenant"
```

```toml
# Customer-facing page gated to the tenant's SSO (no 3B account needed)
route = "/portal"
route_auth = "sso"
```

### API documentation (api.json)

A step whose route is `route_type = "api"` may carry an `api.json` file describing its request and response contract. When this workflow is exposed to other workflows as a connector, their agents read these fragments — assembled into an OpenAPI contract — to learn how to call it, so this is how a workflow's API becomes self-describing to its callers. Write one whenever you build or change a `route_type = "api"` endpoint that's meant to be called by others.

The file is a single JSON object keyed by lowercase HTTP method, where each value is an [OpenAPI Operation Object](https://spec.openapis.org/oas/v3.1.0#operation-object) — i.e. exactly the contents of a path item, without the path itself:

```json
{
  "post": {
    "summary": "Submit a document for summarization",
    "requestBody": {
      "required": true,
      "content": {
        "application/json": {
          "schema": {
            "type": "object",
            "required": ["url"],
            "properties": {
              "url": { "type": "string", "format": "uri" }
            }
          }
        }
      }
    },
    "responses": {
      "200": {
        "description": "Summary produced",
        "content": {
          "application/json": {
            "schema": {
              "type": "object",
              "properties": { "summary": { "type": "string" } }
            }
          }
        }
      }
    }
  }
}
```

Rules:

- **Document only what the platform can't derive.** The path comes from `route`, and the security scheme from `route_auth` — never put `paths`, `servers`, or `security` in the fragment.
- **Schemas are plain [JSON Schema](https://json-schema.org/) (draft 2020-12, as in OpenAPI 3.1).** Keep them **fully self-contained** — inline every schema. A `$ref` into `#/components/…` is rejected, because the fragment has no components section. The same self-contained schema can be imported by the step's own code to validate its inputs (e.g. with Ajv or Python's `jsonschema`), so the docs and the runtime check never drift.
- **Cadence is mechanical.** Whenever you change a `route_type = "api"` step's request or response shape, update its `api.json` in the same commit. Pure refactors that don't change the contract need no change.
- An `api.json` on a step without a `route_type = "api"` route is an error. A `route_type = "api"` route with no fragment still shows up in the contract as an undocumented endpoint — so prefer writing the fragment.

### Cron schedules

Cron schedules only fire on the published version of a workflow. Draft branches never trigger automatically — to test a `cron` step on a draft, run it manually.

### Email triggers

`email_address = "<localpart>"` makes the step receive mail; the raw RFC 822 message becomes its input. Local-parts are `[a-z0-9-]` (≤ 64 chars) and must be unique within the deployment's scope. The full deliverable address depends on operator config — don't guess it in code. Test the step by running it manually with a sample RFC 822 body as input; don't try to send real mail from a script.

## Linking steps

Data flows between steps through links. To link step A to step B, add B's directory name to A's `links` array in `config.toml`:

```toml
# In "Fetch data/config.toml"
color = "sky"
links = ["Transform"]
```

When "Fetch data" runs, its stdout becomes stdin for "Transform". Downstream steps run automatically when their upstream completes — no separate trigger config.

## Data flow between steps

Each step is an isolated process. Data flows through stdin and stdout, and steps can share persistent state via named volumes (see "Persistent storage" below).

1. A step reads its input from stdin — this is either the upstream step's stdout, or for route steps, an RFC 7230 HTTP request.
2. The step processes the data and writes its result to stdout.
3. Stdout becomes stdin for all linked downstream steps. When a step links to multiple downstream steps, all receive the same stdout and run in parallel (fan-out).

If a step produces no stdout (zero bytes), downstream steps will not run. This is intentional — a step that conditionally writes nothing acts as a filter. When you do want downstream steps to run, write something to stdout (`"ok"` or `"{}"` is fine).

### What stdin contains

- No upstream: stdin is empty.
- Linked from another step: stdin is the upstream step's raw stdout bytes.
- Step with `route`: stdin is a full RFC 7230 HTTP request (request line, headers, blank line, body).
- Multiple upstream links: the most recent successful upstream output is used.

### Reading stdin

Read small structured inputs all at once. For large route bodies, parse the RFC 7230 headers first, then stream or spool the body in chunks.

```typescript
// TypeScript
const input = await Bun.stdin.text();
const data = JSON.parse(input);
```

```python
# Python
import sys, json
raw = sys.stdin.read()
data = json.loads(raw)
```

```bash
# Shell
INPUT=$(cat)
echo "$INPUT" | jq '.field'
```

### Writing stdout

Write exactly what the next step needs. Don't print debug output to stdout — it corrupts the data. Use stderr for logging (`console.error` in TypeScript, `print(..., file=sys.stderr)` in Python, `>&2` in shell) — it's the only error text the user sees, and only its first 10 KiB is kept.

For large outputs, especially file downloads from `/storage/<volume>`, stream bytes to stdout instead of loading the whole file first:

```typescript
const file = Bun.file(path);
process.stdout.write(
  [
    "HTTP/1.1 200 OK",
    "Content-Type: application/octet-stream",
    `Content-Length: ${file.size}`,
    "",
    "",
  ].join("\r\n")
);

for await (const chunk of file.stream()) {
  process.stdout.write(chunk);
}
```

## HTTP workflows

To build an HTTP-triggered workflow:

1. Set `route = "/path"` on the entry step (the one that receives the browser request). Any non-empty path works; give the workflow its own specific path. Reserve `"/"` (the space root) for the rare case where the user wants a homepage for their space — don’t reach for it by default.
2. The step that responds to the browser needs `output = true` — its stdout becomes the HTTP response. This is the route step itself when it responds directly (the common case: an API endpoint or page with no downstream steps); it's a downstream step only when one of those produces the response. Without a reachable `output = true` step the request returns `202 Accepted` with no body.
3. The output step must emit a full RFC 7230 HTTP response (status line, headers, blank line, body). Use `\r\n` line endings and a `\r\n\r\n` separator between headers and body.
4. For cookies, prefer the `__Host-` prefix (e.g. `__Host-session=…; Path=/; Secure; HttpOnly`) and always set `HttpOnly` unless client-side JavaScript needs to read it. Cookies are pinned to your space's subdomain: `Domain=` is stripped and `SameSite=None` is downgraded to `SameSite=Lax`, so a cookie cannot be shared across spaces or sent on cross-site requests.

## Branch awareness

`process.env._3B_BRANCH_ID` holds the current draft branch ID, or an empty string when the workflow is running on its main (published) branch. Use it whenever you have to embed a URL that points back at this workflow's own routes — append `?branch=${id}` when the value is non-empty, omit the parameter when it is empty. This is the only correct way to embed a branch reference; never hard-code a branch ID into source files, since drafts are deleted on promote and any literal reference 404s.

## Workflow data design

Before building any workflow that stores files, shares files between steps, persists state across runs, uses SQLite or cache files, handles uploads or generated artifacts, receives many concurrent inputs, runs parallel workers, builds reporting data, or needs temporary per-run files, load the `workflow-volume-design` skill.

Use that skill to choose the workflow shape from the product goal. Do not ask nontechnical users to choose `scope`, `concurrency`, exclusive writers, or branch state. Ask what should happen to the data, who owns it, and who needs to update it.

Design every workflow with the expectation that a new run may start before an earlier run finishes. An exclusive volume stays locked for the whole step, including time spent waiting for a model or network request. Finish slow work before entering an exclusive writer step unless the product truly requires each run to happen one at a time.

## Dockerfile format

Each template's Dockerfile starts with `FROM 3b/base` (the only supported base image) and includes `RUN` statements with `--mount=type=cache` for cached installs. Don't rewrite or remove the existing lines. You can append:

- `RUN <command>` — runs during build. Supports `\` line continuation, heredoc (`RUN <<'DELIM'`), and `--mount=type=cache,target=<name>` for layer caching. `<name>` is a single workdir-relative segment of letters, digits, `.`, `_`, `-` (e.g. `node_modules`, `bun`, `output.css`) — not an absolute path. Don’t try to cache things like `/root/.bun/install/cache`; for npm deps, edit `package.json` and let the existing Bun install layer cache `node_modules`.
- `COPY <sources...> .` — copies step files into the work directory.
- `CMD <command>` — the command that runs at runtime.
- `LABEL io.3b.exec.checkpoint.v2=true` — opts the step into application-defined checkpoint/restore. Do not add it by default; use it only when the user asks to reuse expensive initialized memory. Code before `/opt/3b/next` prepares reusable state, and calling `next` blocks and defines the checkpoint boundary. Each execution restores a fresh, single-use sandbox from that boundary, then `next` returns `{ execId, env }` and code after it runs once. Apply the needed values from `env`, then access volumes and read execution input from stdin. Put anything that must be fresh for each execution after `next`. Preparation may run again on another worker or after eviction, so it must be safe to repeat. Unlabeled steps and command overrides use normal process execution.
- `VOLUME ["<name>:ro"]` — mounts a named volume at `/storage/<name>`, read-only. The default choice: use it whenever the step doesn’t write to the volume.
- `VOLUME ["<name>"]` — read-write; overlapping writers may publish concurrently when they change different paths or directories.
- `VOLUME ["<name>:concurrency=exclusive"]` — read-write with exclusive scheduling for writers that update the same record, index, database path, or logical file group.
- `VOLUME ["<name>:scope=run"]` — read-write storage for one workflow run.

## Persistent storage (named volumes)

Volumes are named POSIX directories mounted under `/storage`. Names are 1–63 characters of lowercase letters, digits, dashes, or underscores, and must start with a letter or digit. Each `VOLUME` declaration selects a name and configures the mount’s lifetime, access, and writer scheduling.

In Live, a volume belongs to the space and is selected by name. Every workflow in the space that declares `VOLUME ["state"]` mounts the same committed files at `/storage/state`. Declaring the name is the complete sharing mechanism.

Draft branches have isolated files for the same volume name, and those files are discarded when the draft branch is deleted or pushed to Live. `scope=run` instead gives one workflow run its own volume; every step in that run that declares the same name with `scope=run` mounts its committed files.

A step writes into a private view and publishes its changes only when it succeeds. Scope controls lifetime. Access controls read-only versus writable mounts. Concurrency controls whether overlapping writers can publish together. Use `:ro` for readers, concurrent writers when they own separate paths or directories, and `concurrency=exclusive` when writers update the same record, index, database path, or logical file group.


## Step templates (local)

Read-only template scaffolds are available at `.3b/templates/<type>/` (shell, python, typescript, react, agent). Always create a new step by copying a template:

```sh
cp -r .3b/templates/typescript "<Name>"
```

Default to typescript for data processing.

For an agent that calls a model — chat or autonomous — copy the `agent` template instead of hand-rolling a model loop. It ships a working loop (streaming, transcript, usage, run limits) as editable files in `agent.ts` and `runtime/`; you normally only touch `system.md`, `tools/` (one tool per file), `model.json`, `config.toml`, and `buildInput` in `agent.ts` — the function you own that shapes the trigger payload into the agent's input. A `route` plus `output = true` in `config.toml` makes it caller-invoked (chat or webhook); without them it is a headless node — the previous step's output is its input, and its whole stdout is one structured result object whose `text` field is the final answer. Read the building-agents skill before building one: it covers routing, auth, conversations, tools, and the mandatory self-loop for async agents (one LLM request per run, linked back to itself).

## Skills (local)

Reference material for specific capabilities is available at `.3b/skills/<name>/SKILL.md`. Read a skill’s `SKILL.md` when you need detailed guidance on the topic it covers — for example, before writing a React step or building an agentic loop. A skill may also include referenced files under its directory; resolve those paths relative to the skill’s `SKILL.md`.

## Git

If this directory contains a `.git` folder, it is a clone of a 3B space; each top-level directory is one workflow. You can use standard git operations to make changes:

```sh
# Edit files, then commit and push
git add -A && git commit -m "Describe your change" && git push
```

Changes pushed to the remote are applied to the workflow in 3B. If someone edited the workflow in the cloud while you were working locally, git will reject your push — pull first, resolve any conflicts, then push again.

The `AGENTS.md` file and the `.3b/` directory are managed by 3B and will be regenerated automatically. Don't check them in or modify them.

## Installing the 3B CLI

```sh
curl -fsSL https://se-demo.3b.dev/cli/install.sh | sh
```

Then configure your API key:

```sh
3b configure
```

run `3b --help` for more information.

### Examples

```sh
# Run a workflow with input and wait for output
echo "Hello" | 3b run wf_abc123 --wait

# Run with JSON input
cat data.json | 3b run wf_abc123 --wait --type application/json

# Chat with a workflow
3b chat wf_abc123

# One-shot chat from stdin
echo "Summarize this" | 3b chat wf_abc123
```

## API

The 3B REST API is documented at https://se-demo.3b.dev/api/v1/docs. It is unstable and likely to change: breaking changes can ship at any time, so treat anything you build on it as provisional. Authenticate with `Authorization: Bearer <api-key>`. Key endpoints:

- `GET /api/v1/spaces` — list spaces
- `GET /api/v1/spaces/:id/workflows` — list workflows
- `POST /api/v1/workflows/:id/run` — trigger a run
- `GET /api/v1/workflows/:id/runs/:runId` — check status
- `POST /api/v1/workflows/:id/chat` — chat with a workflow
