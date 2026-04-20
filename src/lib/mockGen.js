// src/lib/mockGen.js
const STATUSES = ["Created","Picked Up","In Transit","Out for Delivery","Delivered","Exception"];
const SERVICES = ["Standard","Express","Priority","Freight"];
const CITIES = ["Paris, France","Berlin, Germany","Brussels, Belgium","Lagos, Nigeria","London, United Kingdom","Milan, Italy","Madrid, Spain","Lisbon, Portugal"];
const NAMES = ["A. Customer","B. Hansen","C. Okafor","D. Müller","E. Rossi","F. Thompson","G. Bello","H. Martins"];

const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
const rnd = (min,max) => Math.round(min + Math.random()*(max-min));
const id = (p) => p + Math.random().toString(36).slice(2,8).toUpperCase();

export function buildMockBundle({ counts = {} } = {}) {
  const nShip = counts.shipments ?? 18;
  const nAddr = counts.addresses ?? 4;
  const nPkg  = counts.packages ?? 3;
  const nPay  = counts.payments ?? 2;
  const nPick = counts.pickups ?? 2;

  const shipments = Array.from({length:nShip}).map(() => {
    const status = pick(STATUSES);
    const from = pick(CITIES), to = pick(CITIES);
    const service = pick(SERVICES);
    const weight = service==="Freight" ? rnd(80, 480) : rnd(1, 25);
    const price  = service==="Freight" ? rnd(250, 2200) : rnd(15, 180);
    const daysAgo = rnd(0, 120);
    const d = new Date(); d.setDate(d.getDate()-daysAgo);
    return {
      _mock: true,
      createdAt: d.toISOString(),
      trackingNumber: id("EV"),
      serviceType: service==="Freight" ? "freight" : "parcel",
      parcel: service!=="Freight" ? { level: service.toLowerCase(), weight } : undefined,
      freight: service==="Freight" ? { pallets: rnd(1,6), weight } : undefined,
      status: status.replace(/\s+/g, "_").toUpperCase(),
      from, to,
      recipientEmail: `${pick(NAMES).split(" ")[0].toLowerCase()}@example.com`,
      price
    };
  });

  const addresses = Array.from({length:nAddr}).map(() => ({
    _mock: true,
    id: id("AD"),
    name: pick(NAMES),
    line1: rnd(1, 99) + " Example Street",
    city: pick(CITIES).split(",")[0],
    country: pick(CITIES).split(", ").slice(-1)[0],
    default: Math.random() < 0.25
  }));

  const packages = Array.from({length:nPkg}).map(() => ({
    _mock: true,
    id: id("PK"),
    name: "Saved box",
    length: rnd(15, 60), width: rnd(10, 45), height: rnd(8, 40),
    weight: rnd(1, 15),
    service: pick(SERVICES)
  }));

  const payments = Array.from({length:nPay}).map(() => ({
    _mock: true,
    id: id("PM"),
    brand: pick(["Visa","Mastercard","Amex"]),
    last4: rnd(1000,9999),
    exp: `${rnd(1,12).toString().padStart(2,"0")}/${(new Date().getFullYear()%100)+rnd(1,3)} `,
    default: Math.random() < 0.5
  }));

  const pickups = Array.from({length:nPick}).map(() => ({
    _mock: true,
    id: id("PU"),
    date: new Date(Date.now()+rnd(1,21)*86400000).toISOString().slice(0,10),
    window: pick(["09:00–13:00","13:00–17:00","17:00–20:00"]),
    address: `${pick(NAMES)} — ${rnd(1,99)} Example St`,
    recurring: Math.random() < 0.2,
    frequency: pick(["WEEKLY","BIWEEKLY","DAILY"]),
    status: "Requested",
    createdAt: new Date().toISOString()
  }));

  return { shipments, addresses, packages, payments, pickups };
}