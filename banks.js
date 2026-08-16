/* Vietnamese credit card catalog.
   These are STARTING TEMPLATES compiled offline, not live issuer data. Rates and
   caps change often and vary by card tier and promotion, so every generated rule
   is fully editable and the UI tells the user to verify against their real terms. */

const CARD_TEMPLATES = {
  cashback_daily: {
    baseRate: 0.3,
    rules: [
      { g: "dining", rate: 5, cap: [300000, "cashback", "monthly"] },
      { g: "groceries", rate: 5, cap: [300000, "cashback", "monthly"] },
      { g: "gas", rate: 3, cap: [200000, "cashback", "monthly"] }
    ]
  },
  cashback_online: {
    baseRate: 0.3,
    rules: [
      { g: "online", rate: 6, cap: [600000, "cashback", "monthly"] },
      { g: "dining", rate: 3, cap: [300000, "cashback", "monthly"] },
      { g: "entertainment", rate: 3, cap: [200000, "cashback", "monthly"] }
    ]
  },
  travel: {
    baseRate: 0.5,
    rules: [
      { g: "travel", rate: 5, cap: [1000000, "cashback", "monthly"] },
      { g: "hotels", rate: 5, cap: [1000000, "cashback", "monthly"] },
      { g: "dining", rate: 3, cap: [500000, "cashback", "monthly"] }
    ]
  },
  lifestyle: {
    baseRate: 0.3,
    rules: [
      { g: "dining", rate: 5, cap: [400000, "cashback", "monthly"] },
      { g: "entertainment", rate: 5, cap: [300000, "cashback", "monthly"] },
      { g: "beauty", rate: 5, cap: [300000, "cashback", "monthly"] },
      { g: "online", rate: 3, cap: [300000, "cashback", "monthly"] }
    ]
  },
  premium: {
    baseRate: 1,
    rules: [
      { g: "travel", rate: 5, cap: [2000000, "cashback", "monthly"] },
      { g: "hotels", rate: 5, cap: [2000000, "cashback", "monthly"] },
      { g: "dining", rate: 5, cap: [1000000, "cashback", "monthly"] },
      { g: "online", rate: 3, cap: [1000000, "cashback", "monthly"] }
    ]
  },
  transport: {
    baseRate: 0.3,
    rules: [
      { g: "transit", rate: 5, cap: [300000, "cashback", "monthly"] },
      { g: "gas", rate: 5, cap: [300000, "cashback", "monthly"] },
      { g: "dining", rate: 3, cap: [200000, "cashback", "monthly"] }
    ]
  },
  shopping: {
    baseRate: 0.3,
    rules: [
      { g: "retail", rate: 5, cap: [400000, "cashback", "monthly"] },
      { g: "online", rate: 5, cap: [400000, "cashback", "monthly"] },
      { g: "groceries", rate: 3, cap: [200000, "cashback", "monthly"] }
    ]
  },
  basic: {
    baseRate: 0.5,
    rules: [
      { g: "dining", rate: 3, cap: [200000, "cashback", "monthly"] },
      { g: "groceries", rate: 3, cap: [200000, "cashback", "monthly"] }
    ]
  }
};

const VN_BANKS = [
  { id: "vcb", name: "Vietcombank", grad: "emerald", cards: [
    ["Cashback Plus American Express", "cashback_daily"],
    ["Visa Platinum", "premium"],
    ["Mastercard World", "premium"],
    ["Visa Signature", "premium"],
    ["JCB", "cashback_daily"],
    ["Vietnam Airlines Platinum", "travel"]
  ]},
  { id: "tcb", name: "Techcombank", grad: "crimson", cards: [
    ["Visa Signature", "premium"],
    ["Spark", "cashback_daily"],
    ["Style", "lifestyle"],
    ["Everyday", "cashback_daily"],
    ["Vietnam Airlines Visa", "travel"],
    ["Priority Visa Infinite", "premium"]
  ]},
  { id: "vpb", name: "VPBank", grad: "forest", cards: [
    ["StepUp", "cashback_online"],
    ["Shopee Platinum", "cashback_online"],
    ["Lady", "lifestyle"],
    ["Number One", "cashback_daily"],
    ["Diamond World", "premium"],
    ["Titanium Cashback", "cashback_daily"],
    ["MC2", "lifestyle"]
  ]},
  { id: "vib", name: "VIB", grad: "sapphire", cards: [
    ["Online Plus 2in1", "cashback_online"],
    ["Cash Back", "cashback_daily"],
    ["Super Card", "lifestyle"],
    ["Rewards Unlimited", "shopping"],
    ["Travel Élite", "travel"],
    ["Premier Boundless", "premium"],
    ["Financial Free", "basic"]
  ]},
  { id: "tpb", name: "TPBank", grad: "amethyst", cards: [
    ["EVO", "cashback_online"],
    ["Visa FreeGo", "travel"],
    ["World Mastercard", "premium"],
    ["JCB Cashback", "cashback_daily"],
    ["Visa Signature", "premium"]
  ]},
  { id: "mb", name: "MB Bank", grad: "midnight", cards: [
    ["Visa Hi Collection", "lifestyle"],
    ["JCB Sakura", "cashback_daily"],
    ["Visa Priority", "premium"],
    ["Vietnam Airlines Mastercard", "travel"],
    ["MB Visa Online", "cashback_online"]
  ]},
  { id: "acb", name: "ACB", grad: "teal", cards: [
    ["Express", "cashback_online"],
    ["Visa Platinum", "premium"],
    ["Privilege", "premium"],
    ["Mastercard World", "premium"],
    ["Beyond", "lifestyle"]
  ]},
  { id: "stb", name: "Sacombank", grad: "bronze", cards: [
    ["Visa Platinum Cashback", "cashback_daily"],
    ["JCB Ultimate", "lifestyle"],
    ["Mastercard World", "premium"],
    ["Visa Signature", "premium"],
    ["Sacombank Plus", "basic"]
  ]},
  { id: "bidv", name: "BIDV", grad: "slate", cards: [
    ["Visa Platinum Cashback", "cashback_daily"],
    ["Premier", "premium"],
    ["JCB Ultimate", "lifestyle"],
    ["Vietravel", "travel"],
    ["Visa Flexi", "basic"]
  ]},
  { id: "ctg", name: "VietinBank", grad: "sapphire", cards: [
    ["Cremium Visa Platinum", "premium"],
    ["Cremium JCB", "cashback_daily"],
    ["Visa Signature", "premium"],
    ["Mastercard Platinum", "cashback_daily"]
  ]},
  { id: "hdb", name: "HDBank", grad: "crimson", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["Vietjet Platinum", "travel"],
    ["JCB", "basic"],
    ["Priority Visa Signature", "premium"]
  ]},
  { id: "msb", name: "MSB", grad: "rose", cards: [
    ["Visa Signature", "premium"],
    ["mDigi", "cashback_online"],
    ["Online Card", "cashback_online"],
    ["Visa Platinum", "cashback_daily"]
  ]},
  { id: "ocb", name: "OCB", grad: "forest", cards: [
    ["Mastercard Platinum", "cashback_daily"],
    ["Visa Gold", "basic"],
    ["OCB Lifestyle", "lifestyle"]
  ]},
  { id: "shb", name: "SHB", grad: "amethyst", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["Mastercard World", "premium"],
    ["Visa Classic", "basic"]
  ]},
  { id: "seab", name: "SeABank", grad: "teal", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["SeAEasy", "basic"],
    ["Visa Signature", "premium"]
  ]},
  { id: "eib", name: "Eximbank", grad: "midnight", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["JCB", "basic"],
    ["Mastercard World", "premium"]
  ]},
  { id: "hsbc", name: "HSBC Vietnam", grad: "crimson", cards: [
    ["Visa Cash Back", "cashback_daily"],
    ["Live+", "lifestyle"],
    ["TravelOne", "travel"],
    ["Premier World Mastercard", "premium"]
  ]},
  { id: "scb_sc", name: "Standard Chartered", grad: "forest", cards: [
    ["Visa Platinum Cashback", "cashback_daily"],
    ["WorldMiles", "travel"],
    ["Visa Signature", "premium"]
  ]},
  { id: "shinhan", name: "Shinhan Bank", grad: "sapphire", cards: [
    ["Cashback Plus", "cashback_daily"],
    ["Visa Platinum", "premium"],
    ["Travel Platinum", "travel"],
    ["Classic", "basic"],
    ["Shinhan Lotte Mart", "shopping"]
  ]},
  { id: "uob", name: "UOB Vietnam", grad: "midnight", cards: [
    ["Absolute Cashback", "cashback_daily"],
    ["Privi Miles", "travel"],
    ["EVOL", "cashback_online"],
    ["Visa Platinum", "premium"]
  ]},
  { id: "woori", name: "Woori Bank", grad: "slate", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["Visa Classic", "basic"]
  ]},
  { id: "pbvn", name: "Public Bank Vietnam", grad: "teal", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["Visa Gold", "basic"]
  ]},
  { id: "pvcom", name: "PVcomBank", grad: "bronze", cards: [
    ["Mastercard Platinum", "cashback_daily"],
    ["Visa Classic", "basic"]
  ]},
  { id: "abb", name: "ABBank", grad: "rose", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["YOUcard", "lifestyle"]
  ]},
  { id: "lpb", name: "LPBank", grad: "amethyst", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["JCB", "basic"]
  ]},
  { id: "namA", name: "Nam A Bank", grad: "forest", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["Mastercard", "basic"]
  ]},
  { id: "agri", name: "Agribank", grad: "emerald", cards: [
    ["Visa Platinum", "cashback_daily"],
    ["JCB", "basic"],
    ["Lộc Việt", "basic"]
  ]},
  { id: "vab", name: "VietABank", grad: "slate", cards: [["Visa Classic", "basic"]] },
  { id: "bab", name: "Bac A Bank", grad: "forest", cards: [["Visa Platinum", "cashback_daily"]] },
  { id: "klb", name: "KienlongBank", grad: "teal", cards: [["Visa Classic", "basic"]] },
  { id: "ncb", name: "NCB", grad: "crimson", cards: [["Visa Platinum", "cashback_daily"]] },
  { id: "bvb", name: "BaoViet Bank", grad: "sapphire", cards: [["Visa Platinum", "cashback_daily"]] },
  { id: "sgb", name: "SaigonBank", grad: "bronze", cards: [["Visa Classic", "basic"]] },
  { id: "vietbank", name: "VietBank", grad: "midnight", cards: [["Visa Platinum", "cashback_daily"]] },
  { id: "cimb", name: "CIMB Vietnam", grad: "crimson", cards: [
    ["Visa Platinum", "cashback_online"],
    ["Wave", "cashback_online"]
  ]},
  { id: "hlb", name: "Hong Leong Bank", grad: "amethyst", cards: [["Visa Platinum", "cashback_daily"]] },
  { id: "vrb", name: "VRB", grad: "slate", cards: [["Visa Classic", "basic"]] },
  { id: "custom", name: "Ngân hàng khác / Other", grad: "obsidian", cards: [
    ["Cash back card", "cashback_daily"],
    ["Online shopping card", "cashback_online"],
    ["Travel card", "travel"],
    ["Lifestyle card", "lifestyle"],
    ["Premium card", "premium"],
    ["Blank card (no rules)", null]
  ]}
];

/* Turn a template id into concrete rules for a new card. */
function buildTemplateRules(tplId, mkId) {
  const tpl = CARD_TEMPLATES[tplId];
  if (!tpl) return { baseRate: 0, rules: [] };
  return {
    baseRate: tpl.baseRate,
    rules: tpl.rules.map((r) => ({
      id: mkId(),
      kind: "group",
      groupId: r.g,
      mccCodes: [],
      label: groupName(r.g),
      rate: r.rate,
      cap: r.cap ? { amount: r.cap[0], type: r.cap[1], period: r.cap[2] } : null
    }))
  };
}
