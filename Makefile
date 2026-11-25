# GNU Make 4+ only: 3.81 (macOS /usr/bin/make) cannot parse the target-specific
# `export override` lines below, so stop here with the fix instead.
ifneq ($(filter 0 1 2 3,$(firstword $(subst ., ,$(MAKE_VERSION)))),)
$(error GNU Make 4 or later is required, this is $(MAKE_VERSION). On macOS: brew install make, then put its gnubin directory first in PATH, e.g. export PATH="$$(brew --prefix make)/libexec/gnubin:$$PATH", or run gmake instead of make)
endif

.PHONY: help install bootstrap lint format format-check typecheck test build quality rfc-sync improvement smoke smoke-probes smoke-date-probes smoke-core smoke-order-probe account-patterns-range

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_.-]+:.*## ' $(MAKEFILE_LIST) | sed -E 's/:.*## /  /'

install: ## set up git hooks (once)
	pre-commit install

bootstrap: install ## first-run setup: git hooks + fetch deps
	npm install

lint: ## run linters
	npx eslint .
	ruff check tools/

format: ## auto-format
	npx prettier --write .
	ruff format tools/

format-check: ## check formatting (read-only)
	npx prettier --check .
	ruff format --check tools/

typecheck: ## type-check
	if git ls-files '*.ts' '*.tsx' | grep -q .; then npx tsc --noEmit; else echo "no TypeScript yet"; fi

test: ## run tests
	npm test --if-present
	python3 -m unittest discover -s tools/checks

build: ## compile src/ to dist/ (tsconfig.build.json)
	npm run build

quality: lint format-check typecheck test build ## full local gate

# Compiled out of the tree (tsconfig.smoke.json), then run. Never in `quality` or CI.
# Node stops looking for package.json at node_modules/, so the out dir gets its
# own: the output loads as ES modules without relying on syntax detection.
SMOKE_OUT := node_modules/.cache/freshdesk-mcp-smoke
smoke: ## GET-only check of the real account (owner runs it; same env as the server): shapes and counts, no names or ids
	npx tsc -p tsconfig.smoke.json
	printf '{"type":"module"}\n' > $(SMOKE_OUT)/package.json
	node --no-experimental-detect-module $(SMOKE_OUT)/scripts/smoke/cli.js

smoke-probes: ## T-022's GET-only probes of the real account (owner runs it; same env as the server): counts, yes/no and credits, no names or ids
	npx tsc -p tsconfig.smoke.json
	printf '{"type":"module"}\n' > $(SMOKE_OUT)/package.json
	node --no-experimental-detect-module $(SMOKE_OUT)/scripts/smoke/cli.js --probes

smoke-date-probes: ## T-055's GET-only probes of search's date boundary and time zone (owner runs it; same env as the server): dates, counts, the zone's UTC offset, no names or ids
	npx tsc -p tsconfig.smoke.json
	printf '{"type":"module"}\n' > $(SMOKE_OUT)/package.json
	node --no-experimental-detect-module $(SMOKE_OUT)/scripts/smoke/cli.js --dates

# DAYS reaches the shell unexpanded, as a variable: nothing in it runs.
smoke-core: export override DAYS := $(value DAYS)
smoke-core: ## T-039's GET-only run of every core tool (owner runs it; same env as the server; DAYS=N narrows the 7-day period): counts and calls, no names or ids
	npx tsc -p tsconfig.smoke.json
	printf '{"type":"module"}\n' > $(SMOKE_OUT)/package.json
	node --no-experimental-detect-module $(SMOKE_OUT)/scripts/smoke/cli.js --core --days "$${DAYS:-7}"

# DAY reaches the shell unexpanded, as a variable: nothing in it runs.
smoke-order-probe: export override DAY := $(value DAY)
smoke-order-probe: ## T-063's GET-only probe of search's order on one UTC day (owner runs it; same env as the server; DAY=YYYY-MM-DD, yesterday by default): the date, counts and yes/no, no names or ids
	npx tsc -p tsconfig.smoke.json
	printf '{"type":"module"}\n' > $(SMOKE_OUT)/package.json
	node --no-experimental-detect-module $(SMOKE_OUT)/scripts/smoke/cli.js --order --day "$${DAY:-}"

# RANGE reaches the shell unexpanded, as a variable: nothing in it runs.
account-patterns-range: export override RANGE := $(value RANGE)
account-patterns-range: ## maintainer's check of a pull request's commits for account values, run from main (RANGE=<base>..<head>; CONTRIBUTING.md)
	@python3 -I tools/checks/account_patterns.py --range "$$RANGE"

rfc-sync: ## move RFCs into the folder matching their Status
	python3 tools/checks/sync_rfc_status.py

# TEXT reaches the shell unexpanded, as a variable: nothing in it runs.
improvement: export override TEXT := $(value TEXT)
improvement: ## append a commit+date-stamped idea to docs/improvements.md (make improvement TEXT="<idea>")
	sha=$$(git rev-parse --short HEAD 2>/dev/null); printf -- '- [%s%s] %s\n' "$${sha:+$$sha · }" "$$(date +%F)" "$$TEXT" >> docs/improvements.md

.PHONY: gitleaks

# `quality` runs it too: make merges this line into the `quality:` rule.
quality: gitleaks

gitleaks: ## secret scan of the staged diff and of every commit, at the gitleaks pinned in .pre-commit-config.yaml
	pre-commit run gitleaks --all-files
	pre-commit run gitleaks-history --hook-stage manual
