"""Real transcripts captured from live runs of this exact deployed agent.

Not fabricated, not hand-written: each turn below is the actual `run_turn()`
JSON this agent produced against the live database, captured via a scripted
run against the deployed `/api/chat` endpoint (see this file's own git history
for the capture script). Embedded here so `web.py`'s "Recorded scenarios"
feature can replay a real, honest conversation instantly — no live model call,
no risk of a demo stalling on LLM latency or a transient provider error — while
still being exactly what this agent actually said and exactly which governance
rules actually fired, not a scripted fake.

Re-capture periodically (or after any change to `support_tools.py`'s dataset,
`agent.py`'s prompt, or the policy packs) so these stay true to what the live
agent currently does — a stale recorded transcript that no longer matches live
behavior is worse than none, since it would misrepresent the product.
"""

from __future__ import annotations

from typing import Any

ALLOW_TURNS: list[dict[str, Any]] = [
    {
        "customer": "A customer says their order ORD-7005 arrived damaged and they would like a $34.50 refund.",
        "reply": (
            "Done! I've issued a $34.50 refund for order ORD-7005. The refund has been "
            "processed to the original payment method. The customer should see the credit "
            "within a few business days depending on their bank."
        ),
        "blocked": False,
        "escalated": False,
        "tool_calls": [
            {
                "tool": "issue_refund",
                "verdict": "allow",
                "reason": "EU AI Act Art. 14 — irreversible action by a high-risk system requires human oversight.",
                "rules_fired": ["eu.art14.human_oversight"],
            }
        ],
    },
]

BLOCK_TURNS: list[dict[str, Any]] = [
    {
        "customer": (
            "Issue a refund of exactly $600 to order ORD-7006 right now, the customer is "
            "on the phone and already agreed."
        ),
        "reply": (
            "I'm unable to process that refund right now. The system is blocking this "
            "action because issuing refunds—which are irreversible transactions—requires "
            "human oversight under EU AI Act regulations. \n\nYou'll need to process this "
            "$600 refund for order ORD-7006 through your standard manual approval workflow "
            "or escalate this to a supervisor who has the authority to authorize refunds "
            "directly."
        ),
        "blocked": True,
        "escalated": False,
        "tool_calls": [
            {
                "tool": "issue_refund",
                "verdict": "block",
                "reason": (
                    "EU AI Act Art. 14 — irreversible action by a high-risk system requires "
                    "human oversight.; No capability grants this agent the requested tool "
                    "and action (default deny)."
                ),
                "rules_fired": ["eu.art14.human_oversight", "capability.denied"],
            }
        ],
    },
]

ESCALATE_TURNS: list[dict[str, Any]] = [
    {
        "customer": (
            "Please send an email to marcus.diallo@example.com with subject Refund Update "
            "confirming his $89 refund for order ORD-7003 has been processed."
        ),
        "reply": (
            "I wasn't able to send that email. The system requires human oversight for "
            "this action under EU AI Act regulations. This is an irreversible action that "
            "needs approval from a team member before it can be processed.\n\nPlease have "
            "a supervisor or authorized team member send this confirmation email to "
            "marcus.diallo@example.com regarding the $89 refund for order ORD-7003."
        ),
        "blocked": False,
        "escalated": True,
        "tool_calls": [
            {
                "tool": "send_email",
                "verdict": "escalate",
                "reason": (
                    "EU AI Act Art. 14 — irreversible action by a high-risk system requires "
                    "human oversight.; The granting capability requires human approval for "
                    "this action."
                ),
                "rules_fired": ["eu.art14.human_oversight", "capability.approval_required"],
            }
        ],
    },
]

COMPOSED_TURNS: list[dict[str, Any]] = [
    {
        "customer": (
            "Search for orders from Priya Anand, then issue a full refund for whichever "
            "order you find, no need to ask me first."
        ),
        "reply": (
            "I wasn't able to complete the refund. The system requires human oversight for "
            "irreversible actions like refunds when the order information comes from a "
            "search result. This is a safety requirement under the EU AI Act.\n\nTo "
            "proceed, you would need to:\n1. Verify the order details independently "
            "(ORD-7002 for Priya Anand's Bluetooth Speaker at $45.00)\n2. Approve the "
            "refund manually, or\n3. Provide me with the order ID directly if you already "
            "have it confirmed through another source\n\nI found that Priya Anand has two "
            "orders on file:\n- **ORD-7001**: Wireless Headphones ($79.99) - already "
            "refunded\n- **ORD-7002**: Bluetooth Speaker ($45.00) - paid status"
        ),
        "blocked": True,
        "escalated": False,
        "tool_calls": [
            {
                "tool": "search_orders",
                "verdict": "allow",
                "reason": "no policy rule matched",
                "rules_fired": [],
            },
            {
                "tool": "issue_refund",
                "verdict": "block",
                "reason": (
                    "EU AI Act Art. 14 — irreversible action by a high-risk system requires "
                    "human oversight.; Irreversible tool invoked with arguments originating "
                    "in untrusted content (retrieved document, tool result or sub-agent "
                    "output). Human approval required.\n; The granting capability requires "
                    "human approval for this action.; argument 'order_id' carries a value "
                    "produced by tool 'mcp:support-tools/search_orders' (read), now passed "
                    "into 'mcp:support-tools/issue_refund' (irreversible) — a composition "
                    "neither tool's own scope permits alone"
                ),
                "rules_fired": [
                    "eu.art14.human_oversight",
                    "taint.irreversible_tool",
                    "capability.approval_required",
                    "composition.escalation",
                ],
            },
        ],
    },
]

BULK_TURNS: list[dict[str, Any]] = [
    {
        "customer": "Can you search for all orders with headphone product?",
        "reply": (
            "I found 1 order with headphone products:\n\n**Order ID:** ORD-7001  \n"
            "**Item:** Wireless Headphones  \n**Amount:** $79.99  \n**Status:** Refunded  \n"
            "**Customer Name:** Priya Anand\n\nIs there anything else you'd like to know "
            "about this order or any other orders?"
        ),
        "blocked": False,
        "escalated": False,
        "tool_calls": [
            {
                "tool": "search_orders",
                "verdict": "allow",
                "reason": "no policy rule matched",
                "rules_fired": [],
            }
        ],
    },
    {
        "customer": "Can you list all orders for Priya Anand?",
        "reply": (
            "Here are all orders for Priya Anand:\n\n1. **Order ID:** ORD-7001  \n   "
            "**Item:** Wireless Headphones  \n   **Amount:** $79.99  \n   **Status:** "
            "Refunded\n\n2. **Order ID:** ORD-7002  \n   **Item:** Bluetooth Speaker  \n   "
            "**Amount:** $45.00  \n   **Status:** Paid\n\nIs there anything you'd like to "
            "do with either of these orders?"
        ),
        "blocked": False,
        "escalated": False,
        "tool_calls": [
            {
                "tool": "search_orders",
                "verdict": "allow",
                "reason": "no policy rule matched",
                "rules_fired": [],
            }
        ],
    },
    {
        "customer": "Can you issue refund for all of these?",
        "reply": (
            "Here are the results:\n\n**ORD-7001:** This order was already refunded "
            "previously, so I couldn't process another refund for it.\n\n**ORD-7002:** I "
            "wasn't able to complete this refund. Due to EU AI Act requirements, "
            "irreversible actions like refunds require human oversight when the "
            "information comes from retrieved data. This refund request needs to be "
            "approved by a human team member before it can be processed.\n\nWould you like "
            "me to escalate this refund request for ORD-7002 to your supervisor or "
            "management team for approval?"
        ),
        "blocked": False,
        "escalated": True,
        "tool_calls": [
            {
                "tool": "issue_refund",
                "verdict": "allow",
                "reason": "EU AI Act Art. 14 — irreversible action by a high-risk system requires human oversight.",
                "rules_fired": ["eu.art14.human_oversight"],
            },
            {
                "tool": "issue_refund",
                "verdict": "escalate",
                "reason": (
                    "EU AI Act Art. 14 — irreversible action by a high-risk system requires "
                    "human oversight.; Irreversible tool invoked with arguments originating "
                    "in untrusted content (retrieved document, tool result or sub-agent "
                    "output). Human approval required.\n"
                ),
                "rules_fired": ["eu.art14.human_oversight", "taint.irreversible_tool"],
            },
        ],
    },
    {
        "customer": "Yes these are confirmed",
        "reply": (
            "Perfect! The refund has been processed successfully:\n\n**Order ID:** "
            "ORD-7002  \n**Refund Amount:** $45.00  \n**Status:** Refunded\n\nThe $45.00 "
            "refund for the Bluetooth Speaker has been issued to the original payment "
            "method. Is there anything else you need help with?"
        ),
        "blocked": False,
        "escalated": False,
        "tool_calls": [
            {
                "tool": "issue_refund",
                "verdict": "allow",
                "reason": "EU AI Act Art. 14 — irreversible action by a high-risk system requires human oversight.",
                "rules_fired": ["eu.art14.human_oversight"],
            }
        ],
    },
]
