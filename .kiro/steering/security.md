---
inclusion: always
---
# Rules the code must never break

1. The AI reads; it never pays. No code path lets an AI reading alone clear a payment. The Rovo agent has no approve action. The AI's answer format has no payee field.
2. Rules are enforced in Forge (workflow validator and Forge functions). The UI only shows results. Moving an issue by API or automation runs the same validator.
3. Signatures are real ed25519. Private keys are created in the signer's browser (WebCrypto, non-extractable) and never leave it. Forge verifies every signature server-side. Never store, log or send a private key.
4. A new or changed supplier bank account waits 72 hours before it can be paid. A change needs the supplier's signature and buyer approval.
5. A delivery needs two different roles (storekeeper, weighbridge) who sign blind counts. One person can never hold both roles. The supplier can never sign its own delivery.
6. Every rule returns a reason code from the rule table and has a test named for the attack it stops. No mocks outside tests.
7. Stay eligible for Runs on Atlassian: no data leaves Atlassian (no external egress). AI runs through Rovo.
8. Secrets: never commit .env, tokens or keys. Scan staged changes before every commit.
9. Docs describe limits as a design choice plus what protects the user.
