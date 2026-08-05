import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_ORDER_HISTORY_LIMIT,
  DEVICE_ORDER_STORAGE_KEY,
  DEVICE_PROFILE_STORAGE_KEY,
  createDeviceProfileEnvelope,
  parseDeviceProfileStorage,
  readDeviceOrders,
  readDeviceProfile,
  rememberDeviceOrder,
  saveDeviceProfile,
} from "../app/member/device-storage.ts";
import { UnavailableMemberGateway } from "../shared/member-contract.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const profile = {
  contactName: " 林小明 ",
  phone: "0912-345-678",
  email: "member@example.com",
  lineId: "line-contact",
  deliveryMethod: "home_delivery",
  address: "台北市中正區測試路 100 號",
  note: "不可保存",
  access_token: "不可保存",
};

function order(number, createdAt) {
  return {
    orderNumber: `TJD-${String(number).padStart(4, "0")}`,
    status: "new",
    total: 1200 + number,
    currency: "TWD",
    createdAt,
    reservedUntil: null,
    items: [{ name: `測試藏品 ${number}`, quantity: 1 }],
    customerAddress: "不可保存",
    note: "不可保存",
  };
}

test("device checkout profile is versioned, allowlisted, and expires", () => {
  const now = new Date("2026-08-05T00:00:00.000Z");
  const envelope = createDeviceProfileEnvelope(profile, now);
  assert.ok(envelope);
  assert.deepEqual(envelope.value, {
    contactName: "林小明",
    phone: "0912-345-678",
    email: "member@example.com",
    lineId: "line-contact",
    deliveryMethod: "home_delivery",
    address: "台北市中正區測試路 100 號",
  });
  const raw = JSON.stringify(envelope);
  assert.doesNotMatch(raw, /不可保存|access_token|note/);
  assert.ok(parseDeviceProfileStorage(raw, new Date("2026-08-06T00:00:00.000Z")));
  assert.equal(parseDeviceProfileStorage(raw, new Date("2027-03-01T00:00:00.000Z")), null);
  assert.equal(parseDeviceProfileStorage("{bad json", now), null);
  assert.equal(parseDeviceProfileStorage(JSON.stringify({ ...envelope, version: 2 }), now), null);
});

test("profile is only written with explicit device consent and invalid storage is cleared", () => {
  const storage = new MemoryStorage();
  assert.equal(saveDeviceProfile(storage, profile, false), false);
  assert.equal(storage.getItem(DEVICE_PROFILE_STORAGE_KEY), null);
  assert.equal(saveDeviceProfile(storage, profile, true, new Date("2026-08-05T00:00:00.000Z")), true);
  assert.equal(readDeviceProfile(storage, new Date("2026-08-06T00:00:00.000Z")).contactName, "林小明");
  assert.equal(saveDeviceProfile(storage, profile, false), false);
  assert.equal(storage.getItem(DEVICE_PROFILE_STORAGE_KEY), null);

  storage.setItem(DEVICE_PROFILE_STORAGE_KEY, "{broken");
  assert.equal(readDeviceProfile(storage), null);
  assert.equal(storage.getItem(DEVICE_PROFILE_STORAGE_KEY), null);
});

test("device order index strips personal data, deduplicates, and keeps only the newest 20", () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < DEVICE_ORDER_HISTORY_LIMIT + 5; index += 1) {
    const createdAt = new Date(Date.UTC(2026, 7, 5, 0, index)).toISOString();
    assert.equal(rememberDeviceOrder(storage, order(index, createdAt), new Date(createdAt)), true);
  }
  const history = readDeviceOrders(storage);
  assert.equal(history.length, DEVICE_ORDER_HISTORY_LIMIT);
  assert.equal(history[0].orderNumber, "TJD-0024");
  assert.equal(history.at(-1).orderNumber, "TJD-0005");

  const duplicate = order(24, "2026-08-05T02:00:00.000Z");
  duplicate.total = 9999;
  rememberDeviceOrder(storage, duplicate, new Date("2026-08-05T02:00:00.000Z"));
  const deduplicated = readDeviceOrders(storage);
  assert.equal(deduplicated.filter((item) => item.orderNumber === "TJD-0024").length, 1);
  assert.equal(deduplicated[0].total, 9999);
  assert.doesNotMatch(storage.getItem(DEVICE_ORDER_STORAGE_KEY), /customerAddress|不可保存|note/);
});

test("unconfigured member gateway never produces a fake authenticated session", async () => {
  const gateway = new UnavailableMemberGateway();
  assert.deepEqual(await gateway.getCapabilities(), { enabled: false, line: false, emailOtp: false });
  assert.deepEqual(await gateway.getSession(), {
    status: "unavailable",
    reason: "not_configured",
    providers: [],
  });
  assert.equal((await gateway.verifyEmailOtp("challenge", "123456")).status, "unavailable");
  assert.throws(() => gateway.startLineLogin("/account/"), /尚未設定/);
  await assert.rejects(gateway.requestEmailOtp("member@example.com"), /尚未設定/);
});
