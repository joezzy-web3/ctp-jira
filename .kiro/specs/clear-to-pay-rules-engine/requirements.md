# Requirements Document

## Introduction

This spec defines the first working slice of "Clear to Pay for Jira", a Forge app that stops a supplier invoice (a Jira issue) from moving to the "Paid" status until every payment-control rule passes.

The slice delivers a pure rules engine, six breadth-first rules, a workflow validator, an issue panel, ed25519 signing and verification, a supplier payout-route registry, a computed 72-hour bank-account cool-off, and a test strategy.

The Clear_to_Pay_Engine is a pure function. The engine takes an Invoice, a Supplier_Record, a Delivery, and an AI_Reading, and returns a Verdict (CLEARED, HELD, REFUSED, or SEIZED) together with every fired Reason_Code. The engine makes no Jira calls and has no side effects, so it is fully testable in isolation. The Workflow_Validator recomputes the Verdict at transition time from current data and blocks any move to "Paid" unless the Verdict is CLEARED, so moves made through the UI, the REST API, automation, or bulk edit are blocked too.

The six rules in this slice, each touching a different Forge feature, are 1 SEIZED_PAYEE_NOT_REGISTERED, 2 HELD_PAYOUT_COOL_OFF, 7 HELD_ONE_SIGNATURE, 8 HELD_COUNT_MISMATCH, 17 HELD_AI_READING_ONLY, and 21 REFUSED_BYPASS.

## Glossary

- **Clear_to_Pay_Engine**: The pure rules engine in src/rules/. A deterministic function that takes an Invoice, a Supplier_Record, a Delivery, and an AI_Reading and returns a Verdict plus every fired Reason_Code. Contains no Jira calls and no side effects.
- **Invoice**: A supplier invoice represented as a Jira issue. Carries the supplier ID, line items, and any bank account named in invoice text.
- **Supplier_Record**: A supplier stored in Forge Key-Value Storage. Holds exactly one registered Payout_Route.
- **Payout_Route**: The single registered bank account for a Supplier_Record. Includes payableFrom, a server-time timestamp.
- **Delivery**: The physical delivery of goods for an Invoice. Carries blind counts and Signatures from a Storekeeper and a Weighbridge_Operator.
- **Signature**: An ed25519 signature over a delivery or approval payload, produced by a Signer in the browser and verified by the Forge_Function with node:crypto.
- **Signer**: A person who produces a Signature. Either a Storekeeper, a Weighbridge_Operator, or a Supplier.
- **AI_Reading**: The Rovo agent's machine reading of an Invoice. The AI_Reading has no payee field and cannot authorize payment.
- **Verdict**: The overall outcome of the Clear_to_Pay_Engine. One of CLEARED, HELD, REFUSED, or SEIZED.
- **Reason_Code**: A named code from the rule table that identifies the rule that fired. Every refusal returns one or more Reason_Codes.
- **Workflow_Validator**: The jira:workflowValidator module that recomputes the Verdict at transition time and blocks any move to "Paid" unless the Verdict is CLEARED.
- **Issue_Panel**: The jira:issuePanel module that shows the rule checklist and every fired Reason_Code.
- **Key_Registry**: The public-key registry, keyed by accountId and role, that holds the public ed25519 keys used to verify Signatures.
- **Cool_Off**: The computed 72-hour hold placed on a new or changed Payout_Route.
- **payableFrom**: A server-time timestamp stored on a Payout_Route. The Payout_Route may be paid only when the current server time is greater than or equal to payableFrom.
- **scheduledTrigger**: The Forge module that updates the Issue_Panel and notifies users when a Cool_Off expires. The scheduledTrigger never grants payment.
- **Custom_UI**: The browser-side React Custom UI that generates ed25519 key pairs and produces Signatures.
- **Forge_Function**: The server-side Forge function that verifies Signatures, enforces rules, and manages Forge storage.
- **Buyer**: The finance user who approves a Payout_Route change.
- **Storekeeper**: A role that signs a Delivery's blind count.
- **Weighbridge_Operator**: A role that signs a Delivery's blind count. One accountId can never hold both Storekeeper and Weighbridge_Operator.
- **Supplier**: The vendor who issues an Invoice and signs a Payout_Route change, reached through the JSM portal.
- **Approver**: A user who authorizes an action.
- **Jira_Admin**: An administrator who approves a key rotation.
- **accountId**: The Atlassian account identifier of a Signer.

## Requirements

### Requirement 1: Pure Rules Engine

**User Story:** As a solution engineer, I want a rules engine that evaluates an invoice without calling Jira, so that the engine is fully testable in isolation.

#### Acceptance Criteria

1. THE Clear_to_Pay_Engine SHALL be a pure function of the Invoice, Supplier_Record, Delivery, AI_Reading, and current server time supplied as inputs, performing no side effects, including no Jira calls and no reads from or writes to any data store.
2. THE Clear_to_Pay_Engine SHALL produce identical output — the same Verdict and the same list of Reason_Codes in the same order — across at least two invocations supplied with identical inputs.
3. THE Clear_to_Pay_Engine SHALL receive the Supplier_Record, Delivery, and AI_Reading as parameters from the caller rather than fetching the data itself.
4. THE Clear_to_Pay_Engine SHALL accept the current server time as an input parameter so that time-dependent rules are deterministic.
5. THE Clear_to_Pay_Engine SHALL return a result containing a Verdict field and a list of every fired Reason_Code.
6. THE Clear_to_Pay_Engine SHALL not modify the Invoice, Supplier_Record, Delivery, or AI_Reading supplied as inputs.

### Requirement 2: Verdict Precedence

**User Story:** As a finance controller, I want the engine to return the most severe verdict and every fired reason, so that no firing rule is hidden by a less severe one.

#### Acceptance Criteria

1. THE Clear_to_Pay_Engine SHALL order Verdicts by precedence SEIZED above REFUSED above HELD above CLEARED.
2. WHEN one or more rules fire, THE Clear_to_Pay_Engine SHALL return the Verdict of the highest-precedence rule.
3. WHEN one or more rules fire, THE Clear_to_Pay_Engine SHALL return every fired Reason_Code, not only the Reason_Code of the highest-precedence rule.
4. WHEN no rule fires, THE Clear_to_Pay_Engine SHALL return the Verdict CLEARED with an empty list of Reason_Codes.

### Requirement 3: Rule 1 — Payee Not Registered (SEIZED_PAYEE_NOT_REGISTERED)

**User Story:** As a finance controller, I want the engine to seize when an invoice names a payout account that is not the supplier's registered route, so that money cannot be diverted to an unregistered account.

This rule stops the attack where an invoice is paid to a bank account that does not belong to the registered supplier.

#### Acceptance Criteria

1. WHEN the Supplier_Record is known and an Invoice names a bank account that is not equal to the Supplier_Record's registered Payout_Route, THE Clear_to_Pay_Engine SHALL return the Verdict SEIZED and fire the Reason_Code SEIZED_PAYEE_NOT_REGISTERED.
2. WHEN no Supplier_Record exists in Forge Key-Value Storage for the supplier ID carried by the Invoice, THE Clear_to_Pay_Engine SHALL return the Verdict SEIZED and fire the Reason_Code SEIZED_PAYEE_NOT_REGISTERED.
3. WHEN an Invoice names no bank account and the Supplier_Record is known, THE Clear_to_Pay_Engine SHALL use the Supplier_Record's registered Payout_Route as the payout account.
4. WHEN the Supplier_Record is known and an Invoice names a bank account that is equal to the Supplier_Record's registered Payout_Route, THE Clear_to_Pay_Engine SHALL treat the Invoice as payee-matched for this rule.

### Requirement 4: Rule 2 — Payout Cool-Off (HELD_PAYOUT_COOL_OFF)

**User Story:** As a finance controller, I want a new or changed bank account to wait 72 hours before it can be paid, so that a fraudulent account change cannot immediately drain company funds.

This rule stops the attack where a supplier's bank account is changed and paid before anyone notices.

#### Acceptance Criteria

1. WHILE the current server time supplied to the Clear_to_Pay_Engine as an input parameter is earlier than a Payout_Route's payableFrom, THE Clear_to_Pay_Engine SHALL return the Verdict HELD and fire the Reason_Code HELD_PAYOUT_COOL_OFF.
2. WHILE the current server time supplied to the Clear_to_Pay_Engine as an input parameter is greater than or equal to a Payout_Route's payableFrom, THE Clear_to_Pay_Engine SHALL treat the Payout_Route as eligible for payment under this rule.
3. IF the current server time equals a Payout_Route's payableFrom exactly, THEN THE Clear_to_Pay_Engine SHALL treat the Payout_Route as eligible for payment under this rule and SHALL NOT fire the Reason_Code HELD_PAYOUT_COOL_OFF.

### Requirement 5: Rule 7 — Delivery One Signature (HELD_ONE_SIGNATURE)

**User Story:** As a storekeeper, I want a delivery to require signatures from two different roles, so that one person cannot both receive and weigh the same goods.

This rule stops the attack where a single person fabricates both sides of a delivery.

#### Acceptance Criteria

1. WHEN a Delivery carries verified Signatures from fewer than two distinct delivery roles, where the only delivery roles are Storekeeper and Weighbridge_Operator, THE Clear_to_Pay_Engine SHALL return the Verdict HELD and fire the Reason_Code HELD_ONE_SIGNATURE.
2. WHEN a Delivery carries verified Signatures from both a Storekeeper and a Weighbridge_Operator, each produced by a distinct accountId, THE Clear_to_Pay_Engine SHALL treat the Delivery as having two distinct roles for this rule.
3. IF a Signature on a Delivery fails verification, THEN THE Clear_to_Pay_Engine SHALL not count that Signature toward the two-distinct-role requirement for this rule.
4. IF a Signature on a Delivery is produced by a Supplier, THEN THE Clear_to_Pay_Engine SHALL not count that Signature as a Storekeeper or Weighbridge_Operator Signature for this rule.

### Requirement 6: Rule 8 — Count Mismatch (HELD_COUNT_MISMATCH)

**User Story:** As a finance controller, I want the engine to hold when a delivery's two blind counts differ, so that a quantity discrepancy is investigated before payment.

This rule stops the attack where delivered quantity is overstated.

#### Acceptance Criteria

1. WHEN a Delivery carries both a Storekeeper blind count and a Weighbridge_Operator blind count and the two count values differ by any nonzero amount, THE Clear_to_Pay_Engine SHALL return the Verdict HELD and fire the Reason_Code HELD_COUNT_MISMATCH.
2. WHEN a Delivery carries both a Storekeeper blind count and a Weighbridge_Operator blind count and the two count values are equal, THE Clear_to_Pay_Engine SHALL treat the Delivery as count-matched for this rule.
3. IF a Delivery does not carry both a Storekeeper blind count and a Weighbridge_Operator blind count, THEN THE Clear_to_Pay_Engine SHALL NOT fire the Reason_Code HELD_COUNT_MISMATCH for this rule.

### Requirement 7: Rule 17 — AI Reading Only (HELD_AI_READING_ONLY)

**User Story:** As a security officer, I want the engine to hold when only an AI reading indicates an invoice is acceptable, so that an AI reading alone can never clear a payment.

This rule stops the attack where an AI agent is fooled into endorsing an invoice and that endorsement is treated as sufficient to pay.

#### Acceptance Criteria

1. WHEN an AI_Reading is present and no human Signature and no human approval clears the Invoice, THE Clear_to_Pay_Engine SHALL return the Verdict HELD and fire the Reason_Code HELD_AI_READING_ONLY.
2. THE AI_Reading SHALL contain no payee field.
3. THE Clear_to_Pay_Engine SHALL treat the AI_Reading as advisory only, not as a human Signature or a human approval.
4. THE Clear_to_Pay_Engine SHALL derive the Payout_Route solely from the Supplier_Record.
5. WHEN a human Signature or a human approval clears the Invoice, THE Clear_to_Pay_Engine SHALL NOT fire the Reason_Code HELD_AI_READING_ONLY.

### Requirement 8: Rule 21 — Bypass Refusal (REFUSED_BYPASS)

**User Story:** As a security officer, I want any transition to "Paid" that lacks a CLEARED verdict to be refused, so that no move can bypass the rules engine.

This rule stops the attack where a payment is pushed through by API, automation, or bulk edit without passing the rules.

#### Acceptance Criteria

1. WHEN a transition into the "Paid" status occurs and the recomputed Verdict is not CLEARED, THE Workflow_Validator SHALL block the transition so that the issue remains in its pre-transition status, return the Verdict REFUSED, and fire the Reason_Code REFUSED_BYPASS.
2. WHEN a transition into the "Paid" status occurs and the recomputed Verdict is CLEARED, THE Workflow_Validator SHALL permit the transition so that the issue moves to the "Paid" status.
3. WHEN a transition into the "Paid" status is initiated through the Jira UI, the Jira REST API, automation rules, or bulk edits, THE Workflow_Validator SHALL apply the same bypass check to that transition and SHALL not exempt any initiation channel.

### Requirement 9: Workflow Validator

**User Story:** As a security officer, I want the validator to recompute the verdict at transition time from current data, so that a stale or cached verdict can never authorize payment.

#### Acceptance Criteria

1. WHEN a transition into the "Paid" status occurs, THE Workflow_Validator SHALL recompute the Verdict by invoking the Clear_to_Pay_Engine with the current Invoice, Supplier_Record, Delivery, and AI_Reading, including the current server time, read at the moment of the transition.
2. IF the recomputed Verdict is not CLEARED, THEN THE Workflow_Validator SHALL block the transition such that the issue remains in its status prior to the transition.
3. THE Workflow_Validator SHALL apply to transitions made through the Jira UI, the Jira REST API, automation rules, and bulk edits.
4. WHEN a workflow transition into "Paid" exists without the Workflow_Validator attached, THE Issue_Panel SHALL display a warning that the transition is unprotected.
5. THE Workflow_Validator SHALL not authorize a transition into "Paid" using any previously stored or cached Verdict.

### Requirement 10: Issue Panel

**User Story:** As a buyer, I want the issue panel to show the rule checklist and every fired reason code, so that I can see what is blocking or clearing an invoice.

#### Acceptance Criteria

1. THE Issue_Panel SHALL display a checklist of the six rules in this slice (SEIZED_PAYEE_NOT_REGISTERED, HELD_PAYOUT_COOL_OFF, HELD_ONE_SIGNATURE, HELD_COUNT_MISMATCH, HELD_AI_READING_ONLY, and REFUSED_BYPASS), with each rule shown as pass when its Reason_Code is absent from the fired list, as hold when its Reason_Code is present with a HELD prefix, or as fail when its Reason_Code is present with a SEIZED or REFUSED prefix.
2. THE Issue_Panel SHALL display exactly the Reason_Codes in the list returned by the Clear_to_Pay_Engine, adding none and omitting none, so that when no rule fires the panel displays no Reason_Code entries.
3. THE Issue_Panel SHALL defer all rule enforcement to the Forge_Function and SHALL display only results computed by the Forge_Function; THE Issue_Panel SHALL NOT compute a Verdict, fire a Reason_Code, or block a transition itself.

### Requirement 11: Ed25519 Signing and Verification

**User Story:** As a storekeeper, I want to sign deliveries with a key that never leaves my browser, so that signatures cannot be forged.

#### Acceptance Criteria

1. WHEN a Signer registers, THE Custom_UI SHALL generate an ed25519 key pair using WebCrypto with the private key marked non-extractable.
2. THE Custom_UI SHALL retain the private key in the browser and SHALL transmit only the public key to the Forge_Function.
3. WHEN a Signature is submitted for verification, THE Forge_Function SHALL verify the Signature server-side using node:crypto against the public key stored in the Key_Registry.
4. THE Custom_UI SHALL never store, log, or transmit the private key to any destination outside the Signer's browser.
5. IF a private key is submitted to the Forge_Function, THEN THE Forge_Function SHALL reject it without storing or using it.
6. IF a Signature fails node:crypto verification, whether due to a tampered payload, a tampered Signature value, or a mismatched key, THEN THE Forge_Function SHALL reject the Signature as invalid.
7. IF a Signature is submitted for a Signer whose public key is not present in the Key_Registry, THEN THE Forge_Function SHALL reject the Signature as invalid.

### Requirement 12: Key Registry

**User Story:** As a Jira admin, I want the public-key registry to prevent one account from holding both delivery roles, so that one person cannot sign both sides of a delivery.

#### Acceptance Criteria

1. THE Key_Registry SHALL store public keys indexed by accountId and role.
2. WHEN an accountId that already holds the Storekeeper role attempts to register the Weighbridge_Operator role, THE Key_Registry SHALL refuse the registration.
3. WHEN an accountId that already holds the Weighbridge_Operator role attempts to register the Storekeeper role, THE Key_Registry SHALL refuse the registration.
4. THE Key_Registry SHALL store Supplier keys separately from Storekeeper and Weighbridge_Operator keys.
5. WHEN a key is revoked, THE Key_Registry SHALL invalidate every Signature made with that key, including Signatures made before the revocation, such that those Signatures fail verification by the Forge_Function.
6. WHEN a key rotation occurs, THE Key_Registry SHALL perform the rotation as a revocation followed by a new registration approved by a Jira_Admin.
7. WHEN an accountId attempts to register a delivery role it already holds without first revoking the existing key for that role, THE Key_Registry SHALL refuse the registration.
8. IF a key rotation is attempted without approval by a Jira_Admin, THEN THE Key_Registry SHALL refuse the new registration and SHALL leave the existing key unchanged.

### Requirement 13: Supplier Payout Route

**User Story:** As a finance controller, I want each supplier to have exactly one registered payout route that is the sole source of the payout account, so that the payout account cannot be swapped via invoice text.

#### Acceptance Criteria

1. THE Supplier_Record SHALL hold exactly one registered Payout_Route in Forge Key-Value Storage.
2. THE Clear_to_Pay_Engine SHALL determine the payout account solely from the Supplier_Record's registered Payout_Route.
3. THE Clear_to_Pay_Engine SHALL ignore any account named in Invoice text or in the AI_Reading when determining the payout account.
4. WHEN a Payout_Route change is submitted with both a Signature from the Supplier and approval from a Buyer, THE Forge_Function SHALL record the change so that the Supplier_Record holds the new Payout_Route as its sole registered Payout_Route.
5. IF a Payout_Route change is submitted without a Signature from the Supplier or without approval from a Buyer, THEN THE Forge_Function SHALL refuse to record the change and leave the existing registered Payout_Route unchanged.

### Requirement 14: Computed 72-Hour Cool-Off

**User Story:** As a security officer, I want the cool-off to be computed from a server timestamp rather than switched by a trigger, so that a late or absent trigger can neither release money early nor block it forever.

#### Acceptance Criteria

1. WHEN a new or changed Payout_Route is recorded with both a Supplier Signature and a Buyer approval, THE Forge_Function SHALL set payableFrom to the current server time plus 72 hours.
2. THE Clear_to_Pay_Engine SHALL evaluate the Cool_Off solely from the current server time, obtained server-side and never from a client clock, compared to payableFrom.
3. WHEN a Cool_Off expires, meaning the current server time is greater than or equal to payableFrom, THE scheduledTrigger SHALL update the Issue_Panel and notify users.
4. THE scheduledTrigger SHALL limit its effect to updating the Issue_Panel and notifying users, and SHALL NOT alter the Verdict or authorize payment.
5. THE Clear_to_Pay_Engine SHALL compute the Cool_Off status independently of whether the scheduledTrigger has run, so that a scheduledTrigger that is absent or runs late neither releases a Payout_Route before payableFrom nor holds it after payableFrom has passed.

### Requirement 15: Test Strategy

**User Story:** As a solution engineer, I want attack-named tests and a property test, so that every rule is verified against the attack it stops and no input lets an AI reading alone clear a payment.

#### Acceptance Criteria

1. THE test suite SHALL include exactly six vitest attack tests, one per rule in this slice, each test named for the attack the rule stops and not for the rule number, and each test asserting the Verdict and Reason_Code expected for that rule.
2. THE test suite SHALL include a fast-check property test asserting that, when the only clearance signal present is an AI_Reading with no human Signature and no human approval, the Clear_to_Pay_Engine returns a Verdict that is not CLEARED and fires Reason_Code HELD_AI_READING_ONLY, evaluated over at least 100 generated inputs.
3. THE test suite SHALL include a round-trip property test for ed25519 Signatures asserting that a Signature produced by the Custom_UI in the browser verifies in the Forge_Function with node:crypto, that a Signature over a tampered payload fails verification, and that a tampered Signature fails verification.
4. THE production code SHALL use real implementations of ed25519 key generation in the Custom_UI and Signature verification with node:crypto in the Forge_Function, and mocks SHALL be confined to test files.
5. THE six attack tests SHALL exercise the Clear_to_Pay_Engine, and the Workflow_Validator for the REFUSED_BYPASS rule, over the following scenarios: an Invoice naming a bank account that differs from the Supplier_Record's registered Payout_Route returns Verdict SEIZED with Reason_Code SEIZED_PAYEE_NOT_REGISTERED; a Payout_Route evaluated at a current server time earlier than its payableFrom returns Verdict HELD with Reason_Code HELD_PAYOUT_COOL_OFF; a Delivery carrying Signatures from fewer than two distinct roles returns Verdict HELD with Reason_Code HELD_ONE_SIGNATURE; a Delivery whose Storekeeper count differs from its Weighbridge_Operator count returns Verdict HELD with Reason_Code HELD_COUNT_MISMATCH; an Invoice whose only clearance signal is an AI_Reading with no human Signature and no human approval returns Verdict HELD with Reason_Code HELD_AI_READING_ONLY; and a transition into "Paid" whose recomputed Verdict is not CLEARED returns Verdict REFUSED with Reason_Code REFUSED_BYPASS.

## Correctness Properties

1. **No AI reading alone clears a payment.** For all inputs to the Clear_to_Pay_Engine, when the only clearance signal is an AI_Reading and no human Signature and no human approval is present, the Verdict is not CLEARED and the Reason_Code HELD_AI_READING_ONLY fires. (property, fast-check)

2. **The rules engine is a pure function.** For all inputs, the Clear_to_Pay_Engine returns identical output for identical inputs, performs no side effects, and makes no Jira calls. (property)

3. **Verdict precedence with all reason codes.** For all inputs where multiple rules fire, the returned Verdict equals the highest-precedence rule (SEIZED above REFUSED above HELD above CLEARED) and the returned list contains every fired Reason_Code. (property)

4. **The validator recomputes at transition time.** For all transitions into "Paid", the Workflow_Validator decision depends solely on data current at transition time; a cached or previously-stored Verdict cannot authorize payment. (property)

5. **A late or absent scheduledTrigger can neither release money early nor block it forever.** For all states, the Clear_to_Pay_Engine evaluates the Cool_Off from the current server time compared to payableFrom, so a trigger that never runs cannot hold a payment once payableFrom has passed, and a trigger that runs early cannot release a payment before payableFrom. (property)

6. **The payout account comes from the supplier record.** For all inputs, the payout account used by the Clear_to_Pay_Engine equals the Supplier_Record's registered Payout_Route and never equals an account named in Invoice text or the AI_Reading. (property)

7. **Signature verification is a round trip.** For all signing keys, a Signature produced in the browser verifies in the Forge_Function with node:crypto, and a tampered payload or Signature fails verification. (round-trip property)

8. **One account never holds both delivery roles.** For all accountIds, registration of a second delivery role is refused when a first delivery role is already held. (property)

9. **Revocation is retroactive.** For all revoked keys, Signatures made with that key before revocation fail verification after revocation. (property)

10. **Rule 1 fires on account mismatch.** For all invoices naming a bank account that differs from the registered Payout_Route, the Verdict is SEIZED and the Reason_Code SEIZED_PAYEE_NOT_REGISTERED fires. (property)

11. **Cool-off boundary.** When the current server time equals payableFrom exactly, HELD_PAYOUT_COOL_OFF does not fire. (edge case)

## Assumptions

These are trivial structural choices the steering files do not settle; exact names are a design decision for the next phase.

- The Clear_to_Pay_Engine accepts an optional `now` parameter (current server time as a Unix timestamp in milliseconds) so that time-dependent rules stay deterministic; the Forge_Function supplies `Date.now()` when calling the engine. This preserves purity.
- Role values are the strings "storekeeper", "weighbridge", and "supplier".
- Field names such as supplierId, accountId, payableFrom, count, publicKey, signature, and payload are illustrative; exact names are a design decision.
- Issue panel and JSM portal theming (standard navy/gold versus kiroween) is out of scope for this slice except that labels and colours come from CSS variables and never alter rules.
