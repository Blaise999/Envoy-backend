// src/lib/mockStore.js
// Simple in-memory store: userId -> { batchId, createdAt, visibleToUser, data: { shipments, addresses, packages, payments, pickups } }
const store = new Map();

export function putMock(userId, payload) {
  const batchId = `B${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const entry = {
    batchId,
    createdAt: new Date(),
    visibleToUser: !!payload.visibleToUser, // future use (to actually persist)
    data: payload.data || {}
  };
  store.set(String(userId), entry);
  return entry;
}

export function getMock(userId) {
  return store.get(String(userId)) || null;
}

export function clearMock(userId) {
  return store.delete(String(userId));
}
