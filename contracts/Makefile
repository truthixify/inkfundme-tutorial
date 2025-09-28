# Load environment variables from .env (ACCOUNT, CHAIN)
ifneq (,$(wildcard .env))
    include .env
    export
endif

CARGO_CONTRACT = cargo contract

# -------------------------
# Token Config (local vars)
# -------------------------
TOKEN_NAME = \"INKFUNDME\"
TOKEN_SYMBOL = \"IFM\"
TOKEN_DECIMALS = 0
TOKEN_SUPPLY = 1000

TOKEN_ADDRESS = 0x1f92b64f3e344dfd020ccd287e39a660ba329262

# -------------------------
# Build
# -------------------------
.PHONY: build build-token build-inkfundme
build: build-token build-inkfundme

build-token:
	$(CARGO_CONTRACT) build --manifest-path ./src/token/Cargo.toml

build-inkfundme:
	$(CARGO_CONTRACT) build --manifest-path ./src/inkfundme/Cargo.toml

# -------------------------
# Test
# -------------------------
.PHONY: test test-token test-inkfundme
test: test-token test-inkfundme

test-token:
	cargo test --manifest-path ./src/token/Cargo.toml

test-inkfundme:
	cargo test --manifest-path ./src/inkfundme/Cargo.toml

# -------------------------
# Instantiate
# -------------------------
.PHONY: instantiate instantiate-token instantiate-inkfundme
instantiate: instantiate-token instantiate-inkfundme

instantiate-token:
	$(CARGO_CONTRACT) instantiate \
		--constructor new \
		--args $(TOKEN_NAME) $(TOKEN_SYMBOL) $(TOKEN_DECIMALS) $(TOKEN_SUPPLY) \
		--suri $(ACCOUNT_URI) \
		--url $(CHAIN) \
		--manifest-path ./src/token/Cargo.toml \
		--execute

instantiate-inkfundme:
	$(CARGO_CONTRACT) instantiate \
		--constructor new \
		--args $(TOKEN_ADDRESS) \
		--suri $(ACCOUNT_URI) \
		--url $(CHAIN) \
		--manifest-path ./src/inkfundme/Cargo.toml \
		--execute