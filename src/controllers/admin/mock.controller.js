// src/controllers/admin/mock.controller.js

// Adjust these two lines so the filename case matches your actual files on disk:
import * as MockGenNS from "../../lib/mockGen.js";
import * as MockStoreNS from "../../lib/mockStore.js";

// --- Normalize generator API (handles named or default exports + common aliases)
const Gen = MockGenNS.default || MockGenNS;
const buildBundle =
  Gen.buildBundle || Gen.makeBundle || Gen.generateBundle || Gen.bundle;
const makeShipment =
  Gen.makeShipment || Gen.generateShipment || Gen.shipment;
const makeStats =
  Gen.makeStats || Gen.generateStats || Gen.stats; // optional

// ---------- Build a store adapter with a safe fallback ----------
const StoreNS = MockStoreNS.default || MockStoreNS;

// Try to map common names if they exist…
let store = {
  get:   StoreNS?.get   || StoreNS?.load       || StoreNS?.getBundle,
  set:   StoreNS?.set   || StoreNS?.save       || StoreNS?.setBundle || StoreNS?.put,
  merge: StoreNS?.merge || StoreNS?.upsert,
  clear: StoreNS?.clear || StoreNS?.remove     || StoreNS?.delete,
};

// If still missing get/set, install an in-memory fallback so the app runs.
if (typeof store.get !== "function" || typeof store.set !== "function") {
  console.warn("[mock.controller] mockstore API not found — using in-memory fallback.");
  const MEM = new Map(); // userId -> bundle

  store = {
    async get(userId) {
      return MEM.get(userId) || null;
    },
    async set(userId, bundle) {
      MEM.set(userId, bundle);
      return true;
    },
    async merge(userId, partial) {
      const prev = MEM.get(userId) || {};
      const next = { ...prev, ...partial };
      MEM.set(userId, next);
      return next;
    },
    async clear(userId) {
      MEM.delete(userId);
      return true;
    },
  };
}

// ---------- Helpers ----------
function emptyBundle() {
  return {
    shipments: [],
    addresses: [],
    packages: [],
    payments: [],
    pickups: [],
    userStats: { totalShipments: 0, totalSpend: 0 },
  };
}

// ---------- GET /api/admin/mock/:userId ----------
export async function getMockBundle(req, res) {
  const userId = String(req.params.userId || "").trim();
  const bundle = (await store.get(userId)) || emptyBundle();
  return res.json({ data: bundle });
}

// ---------- POST /api/admin/mock/:userId ----------
// body: { counts?: {...}, userStats?: {...}, replace?: boolean }
export async function injectMock(req, res) {
  const userId = String(req.params.userId || "").trim();
  const { counts = {}, userStats = null, replace = true } = req.body || {};

  const generated = buildBundle ? buildBundle({ counts }) : emptyBundle();
  if (userStats) {
    generated.userStats = { ...(generated.userStats || {}), ...userStats };
  }

  if (!replace) {
    const prev = (await store.get(userId)) || emptyBundle();
    const merged = {
      shipments:  [...(generated.shipments  || []), ...(prev.shipments  || [])],
      addresses:  [...(generated.addresses  || []), ...(prev.addresses  || [])],
      packages:   [...(generated.packages   || []), ...(prev.packages   || [])],
      payments:   [...(generated.payments   || []), ...(prev.payments   || [])],
      pickups:    [...(generated.pickups    || []), ...(prev.pickups    || [])],
      userStats:  { ...(prev.userStats || {}), ...(generated.userStats || {}) },
    };
    await store.set(userId, merged);
    return res.json({ message: "Mock overlay merged", data: merged });
  }

  await store.set(userId, generated);
  return res.json({ message: "Mock overlay stored", data: generated });
}

// ---------- PATCH /api/admin/mock/:userId/stats ----------
// body: { totalShipments?, totalSpend? }
export async function updateMockStats(req, res) {
  const userId = String(req.params.userId || "").trim();
  const prev = (await store.get(userId)) || emptyBundle();
  const patch = req.body || {};
  prev.userStats = { ...(prev.userStats || {}), ...patch };
  await store.set(userId, prev);
  return res.json({ message: "Mock stats updated", data: prev.userStats });
}

// ---------- POST /api/admin/mock/:userId/shipments ----------
// body: { shipment?: partial }
export async function addMockShipment(req, res) {
  const userId = String(req.params.userId || "").trim();
  const prev = (await store.get(userId)) || emptyBundle();
  const partial = req.body?.shipment || {};

  const newOne = makeShipment
    ? makeShipment(partial)
    : { ...partial, _id: String(Date.now()) };

  prev.shipments = [newOne, ...(prev.shipments || [])];

  if (prev.userStats) {
    prev.userStats.totalShipments = Number(prev.userStats.totalShipments || 0) + 1;
  }

  await store.set(userId, prev);
  return res.json({ message: "Mock shipment added", data: newOne });
}

// ---------- DELETE /api/admin/mock/:userId ----------
export async function clearMock(req, res) {
  const userId = String(req.params.userId || "").trim();
  await store.clear(userId);
  return res.json({ message: "Mock overlay cleared" });
}
