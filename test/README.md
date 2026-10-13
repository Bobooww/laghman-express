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

New submissions use Web Locks to serialize tabs. Browsers without that capability
can recover an existing attempt and receive browser or kitchen help for a new one.
Do not treat checkout expiry or a missing webhook as evidence that no money moved.
