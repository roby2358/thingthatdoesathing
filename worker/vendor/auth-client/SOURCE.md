# Vendored auth-client

Copied verbatim from yuwakisacloud `jsonsolver/auth-client/src/` at commit
`95d16ef24357e34d3c13e889758e6d8a20587fe0` (2026-05-24), the last commit touching that directory
(the same files starreach vendors in `adapters/cloudflare/vendor/auth-client/`).

It verifies auth/'s access tokens offline (`verifyAccessToken`: Ed25519 over a CBOR claims map,
JWKS cached for 5 minutes, pins issuer, audience and time). It is TypeScript and imports
`cbor-x` (pinned in `worker/package.json`); wrangler's bundler compiles it, and
`worker/index.js` imports it lazily so the Node tests, which import the Worker as plain JS, never
load it (they hand the Worker a stub verifier). Don't edit it here: if auth/ changes its token
format, re-copy from the source and update the commit above. Before each deploy, check that the
source directory hasn't changed since that commit.
