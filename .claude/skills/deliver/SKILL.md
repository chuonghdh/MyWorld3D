---
name: deliver
disable-model-invocation: true
description: Deliver one request end to end. Plans it, delegates to the owning specialists, verifies, gets an independent review and lands it on dev through a pull request. Use as /deliver <request>.
---

Request: $ARGUMENTS

Read `harness/workflows/delivery.md` and run it for the request above: Intake, Plan, Delegate, Verify, Review, Land. Stop at Escalate when a human-only item comes up.

The workflow file is the source of truth. This skill adds no rule.
