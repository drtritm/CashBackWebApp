/* Release notes shown in Settings → What's New.

   Newest first — the app reads entry 0 as "the current release" and badges the
   Settings gear until it has been opened once at that version.

   Each entry is:
     version  the release it describes, matching APP_VERSION when it shipped
     date     YYYY-MM-DD
     title    a short headline, not a category label
     summary  one sentence a non-technical reader can act on
     changes  bullet points, plain language, what changed for the user
     howTo    optional { title, steps[], tip } walkthrough for a new feature

   Keep howTo on entries that introduce something to DO. A bug fix rarely needs
   one — the thing simply works now. */
const CHANGELOG = [
  {
    version: "1.22.1",
    date: "2026-09-06",
    title: "Clearer cash back timing",
    summary: "The cash back wait is counted from the day the statement closes — the card settings now say so instead of leaving you to guess.",
    changes: [
      "The field is now labelled <b>Cash Back Paid — days after close</b>, and a line beneath it works the example out on that card’s own dates.",
      "It updates live as you type the close day or the number of days.",
      "A card with no close day set counts from the last day of the month instead, and the example says so.",
      "Track → Incoming explains the same rule above the payout list."
    ]
  },
  {
    version: "1.22.0",
    date: "2026-09-06",
    title: "What’s New, in Settings",
    summary: "Every release now explains itself — what changed, and step by step how to use it — without leaving the app.",
    changes: [
      "Settings → Version has a <b>What’s New</b> button listing every release, newest first.",
      "Releases that introduce a feature carry a numbered walkthrough, so you never have to guess where a new button lives.",
      "A gold dot appears on the Settings gear when a release you have not read has landed, and clears once you open the list."
    ],
    howTo: {
      title: "Reading the notes",
      steps: [
        "Tap the <b>gear</b> in the top right to open Settings.",
        "Scroll to <b>Version</b> and tap <b>What’s New</b>.",
        "The newest release opens by itself. Tap any older one to expand it.",
        "Where a release added something to do, follow the numbered steps under <b>How to</b>."
      ],
      tip: "The dot on the gear is the only nudge you will get — nothing interrupts you mid-task to announce an update."
    }
  },
  {
    version: "1.21.0",
    date: "2026-09-05",
    title: "Payments onto a card",
    summary: "Record money paid back onto a card — either you settling the bill, or a friend paying you back for something you put on your card.",
    changes: [
      "A payment reduces what the statement still asks you for.",
      "Mark it as “a friend paid me back” and the amount also comes off your spending totals, so Overview and Stats show what you actually spent rather than what passed through the card.",
      "Mark it as “my own bill” and only the statement balance drops — your spending totals stay as they are, because paying a bill is not un-spending.",
      "Cash back never changes either way. The original purchase earned it and keeps it.",
      "Statement rows now show how much has been paid off, e.g. “2.000.000 ₫ paid off · 500.000 ₫ of 2,5 tr ₫”.",
      "Stats and the exported report now use the same statement period as Overview and Cards, so a purchase and the reimbursement for it stay in the same window."
    ],
    howTo: {
      title: "Recording a payment",
      steps: [
        "Open the <b>Cards</b> tab and tap the card. Scroll to the <b>Payments</b> section and tap <b>+ Add</b>. (You can also use <b>+ Payment</b> at the top of Track → Statements.)",
        "Enter the amount, then answer <b>What is this money?</b> — this is the important choice.",
        "Pick <b>A friend paid me back</b> when you fronted their share: their money was never your spending, so it comes off your spend totals and off the statement.",
        "Pick <b>My own bill</b> when you are paying the card off: only the statement balance drops.",
        "Set the date the money actually moved, add a note like “Dinner split — Minh”, and tap <b>Add Payment</b>."
      ],
      tip: "Payments show up in Activity with a FRIEND or PAYMENT tag and a minus sign. Tap one to edit the amount, switch its type, or delete it — every total recalculates straight away."
    }
  },
  {
    version: "1.20.1",
    date: "2026-09-05",
    title: "Mark as Paid works on every card",
    summary: "The Mark as Paid button did nothing on some cards. It now records the payment on all of them.",
    changes: [
      "Fixed: on a card with no statement close day set, tapping Mark as Paid did nothing at all.",
      "Fixed: the same on a card whose most recent closed statement had no purchases on it — a new card, typically.",
      "A card with only a due day now records the payment against that due date, and resets itself for the next month's payment."
    ]
  },
  {
    version: "1.20.0",
    date: "2026-09-05",
    title: "Cash back by statement, not by calendar month",
    summary: "Overview and Cards now group spending and cash back the way your bank settles it.",
    changes: [
      "A card closing on the 20th reports 21 Aug – 20 Sep together, so a purchase on 25 August counts toward September — the statement that will actually pay cash back on it.",
      "Each card follows its own close day, so cards closing on different dates each report their own window.",
      "Cash spending and cards with no close day set still use calendar months.",
      "The Cards tab dates each tile with its real range, and adds “Last statement” and “Calendar month” for reference.",
      "Fixed: entering a top-up amount closed the keyboard after every digit."
    ],
    howTo: {
      title: "Getting the dates right",
      steps: [
        "Open <b>Cards</b>, tap a card, and scroll to <b>Card Settings</b>.",
        "Fill in <b>Statement closes (day)</b> — the day of the month your bank closes the statement, e.g. 20.",
        "Fill in <b>Payment due (day)</b> so the Overview reminder knows when the bill is due.",
        "Labels across the app switch from “month” to “statement” as soon as any card has a close day."
      ],
      tip: "Leave the close day blank and that card simply keeps reporting by calendar month — nothing breaks."
    }
  },
  {
    version: "1.19.0",
    date: "2026-08-29",
    title: "E-wallets live with your cards",
    summary: "An e-wallet is no longer a separate way of logging. The Add tab is Card and Cash, and wallets sit in the same picker as your cards.",
    changes: [
      "The third “Wallet” segment is gone from the Add tab.",
      "Every e-wallet appears under the <b>Pay with</b> picker, grouped below your cards.",
      "Choosing a wallet swaps in its form, where you can log a spend or a top-up as before.",
      "Anything you have already typed carries across when you switch payment source."
    ],
    howTo: {
      title: "Logging with an e-wallet",
      steps: [
        "Open the <b>Add</b> tab and stay on <b>Card</b>.",
        "Open the <b>Pay with</b> dropdown and choose your wallet from the <b>E-Wallets</b> group.",
        "Use <b>Top up</b> when you load money from a card — that is where the cash back is earned.",
        "Use <b>Spend from wallet</b> when you spend the balance; it earns nothing more, because the top-up already earned it."
      ],
      tip: "The <b>E-wallets ›</b> link beside the Pay with label opens the wallet manager, where you add your first wallet or edit an existing one."
    }
  },
  {
    version: "1.18.0",
    date: "2026-08-16",
    title: "E-wallets and Vietnamese",
    summary: "Track money loaded from a card into a wallet and spent later, counted once and categorised properly. Plus a Vietnamese language option.",
    changes: [
      "Load money from a card so the top-up earns that card's cash back, then log what you spend from the wallet.",
      "The spend is counted once, not twice, and keeps its own category.",
      "Vietnamese is available in Settings → Language."
    ]
  }
];
