/* Merchant Category Code catalog.
   Grouped the way card issuers actually define bonus categories, so a rule can
   target a whole group ("Dining") or individual MCCs when a card is pickier. */
const MCC_GROUPS = [
  {
    id: "dining", name: "Dining & Restaurants", icon: "🍽️",
    codes: [
      ["5812", "Eating Places & Restaurants"],
      ["5814", "Fast Food Restaurants"],
      ["5813", "Bars, Taverns & Nightclubs"],
      ["5811", "Caterers"],
      ["5462", "Bakeries"]
    ]
  },
  {
    id: "groceries", name: "Groceries & Supermarkets", icon: "🛒",
    codes: [
      ["5411", "Grocery Stores & Supermarkets"],
      ["5499", "Convenience & Specialty Food Stores"],
      ["5300", "Wholesale Clubs"],
      ["5451", "Dairy Product Stores"],
      ["5422", "Meat Provisioners & Freezers"],
      ["5921", "Liquor Stores"]
    ]
  },
  {
    id: "gas", name: "Gas & EV Charging", icon: "⛽",
    codes: [
      ["5541", "Service Stations"],
      ["5542", "Automated Fuel Dispensers"],
      ["5983", "Fuel Dealers"]
    ]
  },
  {
    id: "online", name: "Online Shopping", icon: "📦",
    codes: [
      ["5964", "Direct Marketing – Catalog Merchant"],
      ["5969", "Direct Marketing – Other"],
      ["5967", "Direct Marketing – Inbound Telemarketing"],
      ["4816", "Computer Network & Information Services"],
      ["5818", "Digital Goods – Multi-Category"],
      ["5817", "Digital Goods – Applications"],
      ["5815", "Digital Goods – Media & Books"],
      ["5816", "Digital Goods – Games"]
    ]
  },
  {
    id: "retail", name: "Retail & Department Stores", icon: "🛍️",
    codes: [
      ["5311", "Department Stores"],
      ["5310", "Discount Stores"],
      ["5399", "Misc. General Merchandise"],
      ["5651", "Family Clothing Stores"],
      ["5691", "Men's & Women's Clothing"],
      ["5661", "Shoe Stores"],
      ["5732", "Electronics Stores"],
      ["5734", "Computer Software Stores"],
      ["5942", "Book Stores"],
      ["5941", "Sporting Goods Stores"],
      ["5945", "Hobby, Toy & Game Shops"],
      ["5999", "Misc. Specialty Retail"]
    ]
  },
  {
    id: "travel", name: "Travel & Airlines", icon: "✈️",
    codes: [
      ["4511", "Airlines & Air Carriers"],
      ["4722", "Travel Agencies & Tour Operators"],
      ["4411", "Cruise Lines"],
      ["4582", "Airports & Flying Fields"]
    ]
  },
  {
    id: "hotels", name: "Hotels & Lodging", icon: "🏨",
    codes: [
      ["7011", "Hotels, Motels & Resorts"],
      ["7012", "Timeshares"],
      ["7033", "Campgrounds & Trailer Parks"]
    ]
  },
  {
    id: "transit", name: "Transit & Rideshare", icon: "🚕",
    codes: [
      ["4121", "Taxicabs & Rideshare"],
      ["4111", "Local & Commuter Transport"],
      ["4112", "Passenger Railways"],
      ["4131", "Bus Lines"],
      ["7512", "Car Rental Agencies"],
      ["7523", "Parking Lots & Garages"],
      ["4784", "Tolls & Bridge Fees"]
    ]
  },
  {
    id: "entertainment", name: "Entertainment & Streaming", icon: "🎬",
    codes: [
      ["7832", "Movie Theaters"],
      ["4899", "Cable, Satellite & Streaming"],
      ["7922", "Theatrical Producers & Ticketing"],
      ["7996", "Amusement Parks & Carnivals"],
      ["7991", "Tourist Attractions"],
      ["7998", "Aquariums & Zoos"],
      ["7997", "Membership Clubs & Golf"],
      ["7994", "Video Game Arcades"]
    ]
  },
  {
    id: "utilities", name: "Utilities & Telecom", icon: "💡",
    codes: [
      ["4900", "Utilities – Electric, Gas, Water"],
      ["4814", "Telecom Services"],
      ["4812", "Telecom Equipment"],
      ["4821", "Telegraph Services"]
    ]
  },
  {
    id: "health", name: "Health & Pharmacy", icon: "⚕️",
    codes: [
      ["5912", "Drug Stores & Pharmacies"],
      ["8011", "Doctors & Physicians"],
      ["8021", "Dentists & Orthodontists"],
      ["8062", "Hospitals"],
      ["8043", "Opticians & Eyeglasses"],
      ["8099", "Medical Services"],
      ["7997", "Gyms & Fitness Clubs"]
    ]
  },
  {
    id: "home", name: "Home Improvement", icon: "🔨",
    codes: [
      ["5200", "Home Supply Warehouse Stores"],
      ["5211", "Lumber & Building Materials"],
      ["5251", "Hardware Stores"],
      ["5231", "Glass, Paint & Wallpaper"],
      ["5712", "Furniture & Home Furnishings"],
      ["5722", "Household Appliance Stores"],
      ["5713", "Floor Covering Stores"]
    ]
  },
  {
    id: "auto", name: "Auto & Vehicle Services", icon: "🚗",
    codes: [
      ["7538", "Auto Service Shops"],
      ["7531", "Auto Body Repair"],
      ["7542", "Car Washes"],
      ["5533", "Auto Parts & Accessories"],
      ["5511", "Car Dealers – New & Used"],
      ["7549", "Towing Services"]
    ]
  },
  {
    id: "beauty", name: "Beauty & Personal Care", icon: "💈",
    codes: [
      ["7230", "Beauty & Barber Shops"],
      ["5977", "Cosmetic Stores"],
      ["7298", "Health & Beauty Spas"],
      ["7297", "Massage Parlors"]
    ]
  },
  {
    id: "education", name: "Education", icon: "🎓",
    codes: [
      ["8220", "Colleges & Universities"],
      ["8211", "Elementary & Secondary Schools"],
      ["8241", "Correspondence Schools"],
      ["8299", "Educational Services"]
    ]
  },
  {
    id: "financial", name: "Financial & Government", icon: "🏛️",
    codes: [
      ["6012", "Financial Institutions"],
      ["6300", "Insurance Sales & Premiums"],
      ["9311", "Tax Payments"],
      ["9399", "Government Services"],
      ["6051", "Quasi-Cash & Money Transfer"]
    ]
  },
  {
    id: "other", name: "Everything Else", icon: "•",
    codes: [
      ["0000", "Uncategorized / Other"],
      ["7399", "Business Services"],
      ["7311", "Advertising Services"],
      ["4215", "Courier & Shipping Services"],
      ["7210", "Laundry & Dry Cleaning"],
      ["8398", "Charitable Organizations"]
    ]
  }
];

/* Flat lookup: code -> { code, name, groupId, groupName, icon } */
const MCC_INDEX = (() => {
  const map = {};
  for (const g of MCC_GROUPS) {
    for (const [code, name] of g.codes) {
      // A few codes legitimately appear in two groups (e.g. 7997 clubs/gyms).
      // First group listed wins as the canonical home.
      if (!map[code]) {
        map[code] = { code, name, groupId: g.id, groupName: g.name, icon: g.icon };
      }
    }
  }
  return map;
})();

function mccInfo(code) {
  return MCC_INDEX[code] || { code, name: "Unknown MCC", groupId: "other", groupName: "Everything Else", icon: "•" };
}
function groupName(groupId) {
  const g = MCC_GROUPS.find((x) => x.id === groupId);
  return g ? g.name : groupId;
}
function groupIcon(groupId) {
  const g = MCC_GROUPS.find((x) => x.id === groupId);
  return g ? g.icon : "•";
}
