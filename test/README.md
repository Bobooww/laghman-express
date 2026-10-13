# Checkout recovery checks

Run `node --test test/payment-recovery.test.cjs` before publishing the checkout pages.
The tests execute the embedded page scripts with offline storage, browser, timer,
and HTTP doubles. They never call the live ordering service or Clover.

Release checks:

- Publish the backend recovery responses before the updated checkout pages.
- Verify the published page bytes against the source, including the domain path conversion.
- Keep an unresolved payment guarded after timeout, reload, browser Back, or a missing status link.
- Resume only the original active checkout; terminal or expired attempts use the status page.
- Confirm one kitchen or an older status link cannot clear another pending attempt.
- Edit a delivery address while its quote is in flight: the old response must stay
  unpayable, the new address must receive a fresh quote, and an existing checkout
  must retain its original recovery key and payload.
- Confirm payment in one tab, then submit the old cart in a second tab: it must
  reload the shared cart without another checkout. Shared edits require repricing;
  intentionally saved new carts and existing checkout recovery must still work.

New submissions use Web Locks to serialize tabs. Browsers without that capability
can recover an existing attempt and receive browser or kitchen help for a new one.
Do not treat checkout expiry or a missing webhook as evidence that no money moved.
