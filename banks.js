/* Vietnamese cashback credit card catalog.

   Compiled from issuer pages and card-comparison sites in August 2026. Only cards
   with a real cashback structure are listed — no filler tiers.

   Rates and caps change every promotion cycle, so every generated rule stays
   editable and the UI tells the user to confirm against their own card terms.

   Rule shape used here:
     g       group id from MCC_GROUPS               (category-wide rule)
     mcc     explicit MCC list                      (used when the issuer names codes)
     rate    percent
     cap     [amount, "cashback"|"spend", period]   per-rule cap
     txnCap  [tierAt, capBelow, capAbove]           per-transaction cashback ceiling
   Card-level:
     cardCap [amount, period, minSpend]             cap across every rule on the card
*/

const VN_BANKS = [
  {
    id: "cake", name: "Cake by VPBank", grad: "rose",
    note: "Cake pays a high flat rate on categories you choose, but clamps it hard per transaction and per cycle.",
    cards: [
      {
        name: "Cake Freedom Visa",
        sub: "20% on chosen categories · strict per-transaction caps",
        baseRate: 0,
        // The distinctive Cake structure: 20% headline, but capped 10k on small
        // transactions and 50k on larger ones, 200k per category, 1tr per cycle,
        // and nothing at all unless the cycle's spend reaches 5tr.
        cardCap: [1000000, "monthly", 5000000],
        rules: [
          { mcc: ["5812", "5814"], label: "Dining (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] },
          { mcc: ["5411"], label: "Supermarket (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] },
          { mcc: ["5262"], label: "Online marketplace (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] },
          { mcc: ["4121"], label: "Ride-hailing (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] },
          { mcc: ["7832"], label: "Cinema (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] }
        ],
        tips: [
          "Pick 5 categories in the Cake app — 3 fixed plus 2 you can switch. Edit the rules here to match what you actually chose.",
          "Under 200.000 ₫ a transaction caps cashback at 10.000 ₫; at or above 200.000 ₫ it caps at 50.000 ₫. Splitting a big bill rarely helps.",
          "Supermarket (MCC 5411) only counts the first transaction each day.",
          "No cashback at all unless the cycle's eligible spend reaches 5.000.000 ₫.",
          "Utilities (4900), passenger transport (4111) and fuel (5541) are excluded entirely."
        ]
      },
      {
        name: "VieON Cake Visa",
        sub: "Same 20% structure as Cake Freedom",
        baseRate: 0,
        cardCap: [1000000, "monthly", 5000000],
        rules: [
          { mcc: ["5812", "5814"], label: "Dining (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] },
          { mcc: ["5411"], label: "Supermarket (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] },
          { mcc: ["5262"], label: "Online marketplace (20%)", rate: 20, cap: [200000, "cashback", "monthly"], txnCap: [200000, 10000, 50000] }
        ],
        tips: ["Same caps as Cake Freedom: 10k/50k per transaction, 200k per category, 1tr per cycle, 5tr minimum spend."]
      },
      {
        name: "Be Cake",
        sub: "20% in the Be app, 0.2% elsewhere",
        baseRate: 0.2,
        cardCap: [500000, "monthly", 0],
        rules: [
          { mcc: ["4121"], label: "Be app rides (20%)", rate: 20, cap: [500000, "cashback", "monthly"] }
        ],
        tips: ["Cashback is capped at 500.000 ₫ per month across the card."]
      }
    ]
  },

  {
    id: "stb", name: "Sacombank", grad: "cobalt",
    cards: [
      {
        name: "Visa Platinum Cashback",
        sub: "5% online · 3% overseas POS · 0.5% other",
        baseRate: 0.5,
        cardCap: [600000, "monthly", 0],
        rules: [
          { g: "online", label: "Online spending (5%)", rate: 5, cap: [600000, "cashback", "monthly"] }
        ],
        tips: [
          "5% applies to online spending both domestic and overseas, capped at 600.000 ₫ a month across the card.",
          "Overseas POS earns 3% — add it as a rule if you spend abroad often.",
          "Airline MCCs earn only the 0.5% base rate, not the online rate."
        ]
      },
      {
        name: "UniQ Mastercard",
        sub: "20% supermarket",
        baseRate: 0.3,
        rules: [
          { g: "groceries", label: "Supermarket (20%)", rate: 20, cap: [300000, "cashback", "monthly"] }
        ],
        tips: ["Strong for household shopping: 20% at supermarkets, capped at 300.000 ₫ a month."]
      },
      {
        name: "JCB Ultimate",
        sub: "Dining & lifestyle cashback",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining", rate: 5, cap: [300000, "cashback", "monthly"] },
          { g: "entertainment", label: "Entertainment", rate: 5, cap: [300000, "cashback", "monthly"] }
        ]
      }
    ]
  },

  {
    id: "vib", name: "VIB", grad: "amber",
    cards: [
      {
        name: "Cash Back",
        sub: "10% dining & entertainment",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining (10%)", rate: 10, cap: [2000000, "cashback", "monthly"] },
          { g: "entertainment", label: "Entertainment (10%)", rate: 10, cap: [2000000, "cashback", "monthly"] }
        ],
        tips: ["Up to 2.000.000 ₫ a month (24tr a year) — one of the highest caps available locally."]
      },
      {
        name: "Super Card",
        sub: "Up to 15%, flexible categories",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining", rate: 15, cap: [600000, "cashback", "monthly"] },
          { g: "entertainment", label: "Entertainment", rate: 15, cap: [600000, "cashback", "monthly"] }
        ],
        tips: ["Categories are flexible — set the rules here to the ones you actually selected."]
      },
      {
        name: "Online Plus 2in1",
        sub: "Online shopping focused",
        baseRate: 0.3,
        rules: [
          { g: "online", label: "Online shopping (6%)", rate: 6, cap: [600000, "cashback", "monthly"] }
        ]
      },
      {
        name: "Family Link",
        sub: "10% family & education",
        baseRate: 0.3,
        rules: [
          { g: "education", label: "Education (10%)", rate: 10, cap: [600000, "cashback", "monthly"] },
          { g: "groceries", label: "Groceries", rate: 5, cap: [300000, "cashback", "monthly"] }
        ],
        tips: ["Supports 0% instalments on tuition."]
      }
    ]
  },

  {
    id: "vpb", name: "VPBank", grad: "jade",
    cards: [
      {
        name: "Diamond World",
        sub: "5% dining & fashion · 2% supermarket",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining (5%)", rate: 5, cap: [500000, "cashback", "monthly"] },
          { g: "retail", label: "Fashion (5%)", rate: 5, cap: [500000, "cashback", "monthly"] },
          { g: "groceries", label: "Supermarket (2%)", rate: 2, cap: [200000, "cashback", "monthly"] }
        ],
        tips: ["The 0.3% base rate on everything else is uncapped."]
      },
      {
        name: "Lady Mastercard",
        sub: "15% education & beauty",
        baseRate: 0.3,
        rules: [
          { g: "beauty", label: "Beauty (15%)", rate: 15, cap: [400000, "cashback", "monthly"] },
          { g: "education", label: "Education (15%)", rate: 15, cap: [400000, "cashback", "monthly"] }
        ]
      },
      {
        name: "StepUp",
        sub: "Online & entertainment",
        baseRate: 0.3,
        rules: [
          { g: "online", label: "Online shopping", rate: 6, cap: [600000, "cashback", "monthly"] },
          { g: "entertainment", label: "Entertainment", rate: 3, cap: [200000, "cashback", "monthly"] }
        ]
      },
      {
        name: "Shopee Platinum",
        sub: "Shopee & e-commerce",
        baseRate: 0.3,
        rules: [
          { mcc: ["5262", "5964"], label: "Shopee / marketplaces", rate: 6, cap: [600000, "cashback", "monthly"] }
        ]
      }
    ]
  },

  {
    id: "tcb", name: "Techcombank", grad: "crimson",
    cards: [
      {
        name: "Visa Signature",
        sub: "Up to 10% dining, hotels & travel",
        baseRate: 0.5,
        rules: [
          { g: "dining", label: "Dining (10%)", rate: 10, cap: [1000000, "cashback", "monthly"] },
          { g: "hotels", label: "Hotels (10%)", rate: 10, cap: [1000000, "cashback", "monthly"] },
          { g: "travel", label: "Travel (10%)", rate: 10, cap: [1000000, "cashback", "monthly"] }
        ]
      },
      {
        name: "Spark",
        sub: "Everyday dining & groceries",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining", rate: 5, cap: [300000, "cashback", "monthly"] },
          { g: "groceries", label: "Groceries", rate: 5, cap: [300000, "cashback", "monthly"] }
        ]
      },
      {
        name: "Style",
        sub: "Lifestyle & entertainment",
        baseRate: 0.3,
        rules: [
          { g: "entertainment", label: "Entertainment", rate: 5, cap: [300000, "cashback", "monthly"] },
          { g: "dining", label: "Dining", rate: 3, cap: [200000, "cashback", "monthly"] }
        ]
      }
    ]
  },

  {
    id: "hsbc", name: "HSBC Vietnam", grad: "ruby",
    cards: [
      {
        name: "Cash Back",
        sub: "6–8% supermarket & taxi · 1% health/education",
        baseRate: 0.3,
        rules: [
          { g: "groceries", label: "Supermarket (6%)", rate: 6, cap: [200000, "cashback", "monthly"] },
          { mcc: ["4121"], label: "Taxi & limousine (6%)", rate: 6, cap: [200000, "cashback", "monthly"] },
          { g: "health", label: "Healthcare (1%)", rate: 1, cap: null },
          { g: "education", label: "Education (1%)", rate: 1, cap: null }
        ],
        tips: [
          "Supermarket and taxi share a 200.000 ₫ monthly cap between them.",
          "Payroll customers earn 8% instead of 6% — raise those two rules if your salary lands at HSBC.",
          "Healthcare, education and the 0.3% base rate are all uncapped."
        ]
      },
      {
        name: "Live+",
        sub: "Dining, shopping & entertainment",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining", rate: 6, cap: [300000, "cashback", "monthly"] },
          { g: "retail", label: "Shopping", rate: 6, cap: [300000, "cashback", "monthly"] },
          { g: "entertainment", label: "Entertainment", rate: 6, cap: [300000, "cashback", "monthly"] }
        ]
      }
    ]
  },

  {
    id: "shinhan", name: "Shinhan Bank", grad: "azure",
    cards: [
      {
        name: "Visa Cash Back Platinum",
        sub: "0.4% on everything, unlimited",
        baseRate: 0.4,
        rules: [],
        tips: ["Flat 0.4% on all spending with no cap and no minimum — simple, no categories to track."]
      },
      {
        name: "Visa Cash Back Standard",
        sub: "0.3% on everything, unlimited",
        baseRate: 0.3,
        rules: [],
        tips: ["Flat 0.3% on all spending, uncapped."]
      },
      {
        name: "365 Cashback Platinum",
        sub: "Everyday categories",
        baseRate: 0.4,
        rules: [
          { g: "dining", label: "Dining", rate: 5, cap: [300000, "cashback", "monthly"] },
          { g: "groceries", label: "Groceries", rate: 5, cap: [300000, "cashback", "monthly"] }
        ]
      }
    ]
  },

  {
    id: "msb", name: "MSB", grad: "violet",
    cards: [
      {
        name: "mDigi",
        sub: "20% dining, travel & digital",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining (20%)", rate: 20, cap: [300000, "cashback", "monthly"] },
          { g: "travel", label: "Travel (20%)", rate: 20, cap: [300000, "cashback", "monthly"] },
          { g: "entertainment", label: "Digital entertainment (20%)", rate: 20, cap: [300000, "cashback", "monthly"] }
        ],
        tips: ["300.000 ₫ monthly cashback ceiling."]
      },
      {
        name: "Visa Online",
        sub: "10% online, 3tr minimum spend",
        baseRate: 0.3,
        cardCap: [300000, "monthly", 3000000],
        rules: [
          { g: "online", label: "Online (10%)", rate: 10, cap: [300000, "cashback", "monthly"] }
        ],
        tips: ["Requires 3.000.000 ₫ of spending in the cycle before cashback applies."]
      }
    ]
  },

  {
    id: "mb", name: "MB Bank", grad: "midnight",
    cards: [
      {
        name: "JCB Sakura",
        sub: "Dining & online",
        baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining", rate: 5, cap: [300000, "cashback", "monthly"] },
          { g: "online", label: "Online", rate: 5, cap: [300000, "cashback", "monthly"] }
        ]
      },
      {
        name: "Visa Platinum",
        sub: "General cashback",
        baseRate: 0.5,
        rules: [
          { g: "dining", label: "Dining", rate: 3, cap: [300000, "cashback", "monthly"] },
          { g: "travel", label: "Travel", rate: 3, cap: [300000, "cashback", "monthly"] }
        ]
      }
    ]
  },

  {
    id: "seab", name: "SeABank", grad: "teal",
    cards: [
      {
        name: "SeAEasy",
        sub: "Online payment cashback",
        baseRate: 0.3,
        rules: [
          { g: "online", label: "Online payments", rate: 5, cap: [300000, "cashback", "monthly"] }
        ]
      },
      {
        name: "Visa Platinum",
        sub: "Fuel & everyday",
        baseRate: 0.3,
        rules: [
          { g: "gas", label: "Fuel", rate: 5, cap: [200000, "cashback", "monthly"] },
          { g: "groceries", label: "Groceries", rate: 3, cap: [200000, "cashback", "monthly"] }
        ]
      }
    ]
  },

  {
    id: "custom", name: "Other bank / build your own", grad: "obsidian",
    cards: [
      { name: "Blank card", sub: "No rules — add your own categories", baseRate: 0, rules: [] },
      {
        name: "Simple cashback card", sub: "Dining + groceries starter", baseRate: 0.3,
        rules: [
          { g: "dining", label: "Dining", rate: 5, cap: [300000, "cashback", "monthly"] },
          { g: "groceries", label: "Groceries", rate: 5, cap: [300000, "cashback", "monthly"] }
        ]
      }
    ]
  }
];

/* Build concrete card fields from a catalog entry. */
function buildFromCatalog(entry, mkId) {
  return {
    baseRate: entry.baseRate || 0,
    cardCap: entry.cardCap
      ? { amount: entry.cardCap[0], period: entry.cardCap[1], minSpend: entry.cardCap[2] || 0 }
      : null,
    rules: (entry.rules || []).map((r) => ({
      id: mkId(),
      kind: r.mcc ? "mcc" : "group",
      groupId: r.g || (r.mcc ? mccInfo(r.mcc[0]).groupId : "other"),
      mccCodes: r.mcc || [],
      label: r.label || (r.g ? groupName(r.g) : "Custom"),
      rate: r.rate,
      cap: r.cap ? { amount: r.cap[0], type: r.cap[1], period: r.cap[2] } : null,
      txnCap: r.txnCap ? { tierAt: r.txnCap[0], below: r.txnCap[1], above: r.txnCap[2] } : null
    }))
  };
}
