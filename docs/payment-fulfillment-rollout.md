# Trip Pass fulfillment change

A verified, paid Checkout session now saves the pass, account plan, permanent purchase record and session receipt in one Redis Lua transaction. Storage failures return HTTP 503. Completed and async-success events use the same session receipt. Receipt creation and access cannot be separated by a process crash or lost HTTP response. Notifications remain best effort and are only attempted by the first successful grant; this is not a durable email outbox.

Pass spending, manual grants and orphan release use compare-and-set retries so a stale pass-ledger writer cannot overwrite a concurrent purchased pass. The transaction validates existing account/pass data before any writes and preserves account fields such as the password hash. It binds a purchase only to a trip currently stored on the buyer's account; a missing/deleted/already-covered trip leaves the pass spare.

## Validation

`payment-validation.yml` runs signed handler tests against a disposable Redis 7 service, existing Stripe signature and pass-rule tests, account-session regressions, application typechecking, changed-file lint and a production build without production credentials. The focused fixture can execute the same Lua with LuaTeX for local development; CI uses actual Redis. No customer data, production Redis credentials, live Stripe calls or real notifications are used.

## Rollout and existing purchases

Deploy BOTH applications together, with Checkout temporarily closed through the existing offering control. Drain old replicas before reopening Checkout, so older webhook code cannot grant alongside the new code. Verify the new workflow and deployment checks first. Existing valid cookies and pass records keep their formats. No schema migration or provider plan upgrade is needed.

The old three-day `white-glove:stripe-events:<session>` marker recorded an attempt, not completed fulfillment. A legacy marker without a new receipt returns 503 for manual reconciliation. Do not automatically replay old sessions: after the old marker expired, pre-change passes have no Checkout ID and cannot safely be matched to a historical payment. Reconcile those purchases against Stripe and the existing ledger before any replay or corrective grant. Deploying this patch does not retroactively repair historical missing access.

New `white-glove:fulfilled-checkout:<session>` receipts have no expiry. Keep them with the existing private-store backups. Rollback to old fulfillment code requires closing Checkout and draining replicas again; the old handler does not understand the new receipts.

Subscription renewal/cancellation and other billing paths retain their existing behavior and need separate validation. This change only makes the paid Trip Pass path durable and retryable. Do not call the entire billing integration launch-ready from these tests alone.
