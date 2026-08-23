import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
import {
  LOCAL_DEMO_CHALLENGE_STORAGE_KEY,
  LOCAL_DEMO_CHALLENGE_TTL_MS,
  LOCAL_DEMO_OTP_CODE,
  LOCAL_DEMO_SESSION_STORAGE_KEY,
  LOCAL_DEMO_SESSION_TTL_MS,
  LocalDemoMemberGateway,
} from "../app/member/local-demo-gateway.ts";
import {
  createMemberGateway,
  isLocalDemoHostname,
} from "../app/member/member-gateway.ts";

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

test("local demo email OTP creates an eight-hour session without storing credentials", async () => {
  const storage = new MemoryStorage();
  let now = new Date("2026-08-05T00:00:00.000Z");
  const gateway = new LocalDemoMemberGateway(storage, {
    now: () => now,
    createId: () => "challenge_fixed_001",
  });

  assert.deepEqual(await gateway.getCapabilities(), { enabled: true, line: false, emailOtp: true });
  await assert.rejects(gateway.requestEmailOtp("not-an-email"), /有效的電子郵件/);

  const challenge = await gateway.requestEmailOtp(" Demo.Member@Example.com ");
  assert.deepEqual(challenge, {
    challengeId: "challenge_fixed_001",
    maskedDestination: "d*****@example.com",
    expiresAt: "2026-08-05T00:10:00.000Z",
    retryAfterSeconds: 0,
  });
  assert.equal(Date.parse(challenge.expiresAt) - now.getTime(), LOCAL_DEMO_CHALLENGE_TTL_MS);
  const challengeStorage = storage.getItem(LOCAL_DEMO_CHALLENGE_STORAGE_KEY);
  assert.doesNotMatch(challengeStorage, new RegExp(LOCAL_DEMO_OTP_CODE));
  assert.doesNotMatch(challengeStorage, /password|access[_-]?token|refresh[_-]?token/i);

  assert.equal((await gateway.verifyEmailOtp(challenge.challengeId, "111111")).status, "error");
  assert.equal(storage.getItem(LOCAL_DEMO_SESSION_STORAGE_KEY), null);

  const authenticated = await gateway.verifyEmailOtp(challenge.challengeId, LOCAL_DEMO_OTP_CODE);
  assert.equal(authenticated.status, "authenticated");
  assert.equal(authenticated.member.email, "demo.member@example.com");
  assert.equal(authenticated.member.emailVerified, true);
  assert.deepEqual(authenticated.member.providers, ["email_otp"]);
  assert.equal(Date.parse(authenticated.expiresAt) - now.getTime(), LOCAL_DEMO_SESSION_TTL_MS);
  assert.equal(storage.getItem(LOCAL_DEMO_CHALLENGE_STORAGE_KEY), null);

  const sessionStorage = storage.getItem(LOCAL_DEMO_SESSION_STORAGE_KEY);
  assert.doesNotMatch(sessionStorage, new RegExp(LOCAL_DEMO_OTP_CODE));
  assert.doesNotMatch(sessionStorage, /password|access[_-]?token|refresh[_-]?token/i);
  assert.deepEqual(await gateway.getSession(), authenticated);

  await gateway.signOut();
  assert.deepEqual(await gateway.getSession(), { status: "anonymous" });
  assert.equal(storage.getItem(LOCAL_DEMO_SESSION_STORAGE_KEY), null);
  now = new Date("2026-08-05T00:00:00.000Z");
});

test("local demo challenges and sessions expire and clear invalid storage", async () => {
  const storage = new MemoryStorage();
  let currentTime = Date.parse("2026-08-05T00:00:00.000Z");
  const gateway = new LocalDemoMemberGateway(storage, {
    now: () => new Date(currentTime),
    createId: () => "challenge_expiry_001",
  });

  const challenge = await gateway.requestEmailOtp("member@example.com");
  currentTime += LOCAL_DEMO_CHALLENGE_TTL_MS;
  const expiredChallenge = await gateway.verifyEmailOtp(challenge.challengeId, LOCAL_DEMO_OTP_CODE);
  assert.equal(expiredChallenge.status, "error");
  assert.match(expiredChallenge.message, /過期/);
  assert.equal(storage.getItem(LOCAL_DEMO_CHALLENGE_STORAGE_KEY), null);

  currentTime = Date.parse("2026-08-05T01:00:00.000Z");
  const fresh = await gateway.requestEmailOtp("member@example.com");
  assert.equal((await gateway.verifyEmailOtp(fresh.challengeId, LOCAL_DEMO_OTP_CODE)).status, "authenticated");
  currentTime += LOCAL_DEMO_SESSION_TTL_MS;
  assert.deepEqual(await gateway.getSession(), { status: "anonymous" });
  assert.equal(storage.getItem(LOCAL_DEMO_SESSION_STORAGE_KEY), null);

  storage.setItem(LOCAL_DEMO_SESSION_STORAGE_KEY, "{broken");
  assert.deepEqual(await gateway.getSession(), { status: "anonymous" });
  assert.equal(storage.getItem(LOCAL_DEMO_SESSION_STORAGE_KEY), null);
});

test("member gateway enables the demo only for exact loopback hostnames", async () => {
  const localHosts = ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"];
  for (const hostname of localHosts) {
    assert.equal(isLocalDemoHostname(hostname), true);
    const gateway = createMemberGateway(hostname, new MemoryStorage(), {
      createId: () => "challenge_local_001",
    });
    assert.deepEqual(await gateway.getCapabilities(), { enabled: true, line: false, emailOtp: true });
  }

  for (const hostname of ["taijuda.example", "localhost.example", "127.0.0.2", ""]) {
    assert.equal(isLocalDemoHostname(hostname), false);
    const storage = new MemoryStorage();
    const gateway = createMemberGateway(hostname, storage);
    assert.deepEqual(await gateway.getCapabilities(), { enabled: false, line: false, emailOtp: false });
    assert.equal(storage.values.size, 0);
  }

  assert.deepEqual(
    await createMemberGateway("localhost", null).getCapabilities(),
    { enabled: false, line: false, emailOtp: false },
  );
});

test("member-facing copy stays consumer-friendly instead of exposing storage internals", async () => {
  const [accountClient, accountPage, publicHeader, storefront] = await Promise.all([
    readFile(new URL("../app/account/account-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/public-header.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(accountClient, /會員登入/);
  assert.match(accountClient, /會員中心/);
  assert.match(accountClient, /個人資料/);
  assert.match(accountClient, /我的訂單/);
  assert.match(accountClient, /LOCAL_DEMO_OTP_CODE/);
  assert.match(accountPage, /會員中心/);
  assert.match(publicHeader, /會員中心/);
  assert.match(storefront, /<PublicHeader/);
  assert.match(storefront, /section="home"/);

  const memberCopy = [accountClient, accountPage, publicHeader, storefront].join("\n");
  assert.doesNotMatch(memberCopy, /你的收藏資料/);
  assert.doesNotMatch(memberCopy, /此裝置預備版/);
  assert.doesNotMatch(memberCopy, /DEVICE CUSTOMER CENTRE/);
  assert.doesNotMatch(memberCopy, /送單索引/);
});
