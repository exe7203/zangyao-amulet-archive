import type {
  AuthCapabilities,
  MemberGateway,
  MemberSessionState,
  MemberSummary,
} from "../../shared/member-contract";
import { PUBLIC_SITE_CODE } from "../../shared/site-context";

export const LOCAL_DEMO_OTP_CODE = "246810";
export const LOCAL_DEMO_CHALLENGE_TTL_MS = 10 * 60 * 1000;
export const LOCAL_DEMO_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const LOCAL_DEMO_CHALLENGE_STORAGE_KEY = `${PUBLIC_SITE_CODE}:local-demo-auth-challenge:v1`;
export const LOCAL_DEMO_SESSION_STORAGE_KEY = `${PUBLIC_SITE_CODE}:local-demo-auth-session:v1`;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHALLENGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;

export type SessionStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type LocalDemoMemberGatewayOptions = {
  now?: () => Date;
  createId?: () => string;
};

type StoredChallenge = {
  version: 1;
  scope: "local-demo";
  challengeId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
};

type StoredSession = {
  version: 1;
  scope: "local-demo";
  createdAt: string;
  expiresAt: string;
  member: MemberSummary;
};

function safeRemove(storage: SessionStorageLike, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // sessionStorage may be unavailable under strict browser privacy settings.
  }
}

function readJson(storage: SessionStorageLike, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return null;
  }
}

function writeJson(storage: SessionStorageLike, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("瀏覽器目前無法建立本機測試工作階段");
  }
}

function validNow(now: () => Date) {
  const value = now();
  if (Number.isNaN(value.getTime())) throw new Error("本機測試時間不正確");
  return value;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error("請輸入有效的電子郵件地址");
  }
  return email;
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}${"*".repeat(Math.min(Math.max(name.length - 1, 2), 5))}@${domain}`;
}

function memberIdForEmail(email: string) {
  let hash = 2166136261;
  for (const character of email) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `demo-member-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function memberForEmail(email: string): MemberSummary {
  const displayName = email.slice(0, email.indexOf("@")).slice(0, 80) || "示範會員";
  return {
    id: memberIdForEmail(email),
    displayName,
    email,
    pictureUrl: null,
    emailVerified: true,
    providers: ["email_otp"],
  };
}

function isStoredChallenge(value: unknown): value is StoredChallenge {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredChallenge>;
  return candidate.version === 1 && candidate.scope === "local-demo" &&
    typeof candidate.challengeId === "string" && CHALLENGE_ID_PATTERN.test(candidate.challengeId) &&
    typeof candidate.email === "string" && EMAIL_PATTERN.test(candidate.email) &&
    typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt)) &&
    typeof candidate.expiresAt === "string" && !Number.isNaN(Date.parse(candidate.expiresAt));
}

function isMemberSummary(value: unknown): value is MemberSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<MemberSummary>;
  return typeof candidate.id === "string" && candidate.id.startsWith("demo-member-") &&
    typeof candidate.displayName === "string" && candidate.displayName.length > 0 &&
    typeof candidate.email === "string" && EMAIL_PATTERN.test(candidate.email) &&
    candidate.pictureUrl === null && candidate.emailVerified === true &&
    Array.isArray(candidate.providers) && candidate.providers.length === 1 &&
    candidate.providers[0] === "email_otp";
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredSession>;
  return candidate.version === 1 && candidate.scope === "local-demo" &&
    typeof candidate.createdAt === "string" && !Number.isNaN(Date.parse(candidate.createdAt)) &&
    typeof candidate.expiresAt === "string" && !Number.isNaN(Date.parse(candidate.expiresAt)) &&
    isMemberSummary(candidate.member);
}

function authError(message: string): MemberSessionState {
  return { status: "error", message, retryable: true };
}

export class LocalDemoMemberGateway implements MemberGateway {
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(
    private readonly storage: SessionStorageLike,
    options: LocalDemoMemberGatewayOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  async getCapabilities(): Promise<AuthCapabilities> {
    return { enabled: true, line: false, emailOtp: true };
  }

  async getSession(): Promise<MemberSessionState> {
    const value = readJson(this.storage, LOCAL_DEMO_SESSION_STORAGE_KEY);
    if (value === undefined) return { status: "anonymous" };
    if (!isStoredSession(value)) {
      safeRemove(this.storage, LOCAL_DEMO_SESSION_STORAGE_KEY);
      return { status: "anonymous" };
    }

    const now = validNow(this.now).getTime();
    const createdAt = Date.parse(value.createdAt);
    const expiresAt = Date.parse(value.expiresAt);
    if (createdAt > now || expiresAt <= now || expiresAt - createdAt !== LOCAL_DEMO_SESSION_TTL_MS) {
      safeRemove(this.storage, LOCAL_DEMO_SESSION_STORAGE_KEY);
      return { status: "anonymous" };
    }

    return { status: "authenticated", member: value.member, expiresAt: value.expiresAt };
  }

  startLineLogin(): never {
    throw new Error("本機示範只提供 Email 驗證碼登入");
  }

  async requestEmailOtp(emailInput: string) {
    const email = normalizeEmail(emailInput);
    const now = validNow(this.now);
    const challengeId = this.createId();
    if (!CHALLENGE_ID_PATTERN.test(challengeId)) {
      throw new Error("本機測試驗證識別碼不正確");
    }
    const challenge: StoredChallenge = {
      version: 1,
      scope: "local-demo",
      challengeId,
      email,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LOCAL_DEMO_CHALLENGE_TTL_MS).toISOString(),
    };
    writeJson(this.storage, LOCAL_DEMO_CHALLENGE_STORAGE_KEY, challenge);
    return {
      challengeId,
      maskedDestination: maskEmail(email),
      expiresAt: challenge.expiresAt,
      retryAfterSeconds: 0,
    };
  }

  async verifyEmailOtp(challengeIdInput: string, codeInput: string): Promise<MemberSessionState> {
    const challengeId = challengeIdInput.trim();
    const code = codeInput.trim();
    if (!CHALLENGE_ID_PATTERN.test(challengeId) || !/^\d{6}$/.test(code)) {
      return authError("驗證資料格式不正確，請重新取得驗證碼");
    }

    const value = readJson(this.storage, LOCAL_DEMO_CHALLENGE_STORAGE_KEY);
    if (!isStoredChallenge(value)) {
      safeRemove(this.storage, LOCAL_DEMO_CHALLENGE_STORAGE_KEY);
      return authError("找不到有效的驗證要求，請重新取得驗證碼");
    }

    const now = validNow(this.now);
    const createdAt = Date.parse(value.createdAt);
    const expiresAt = Date.parse(value.expiresAt);
    if (
      createdAt > now.getTime() || expiresAt <= now.getTime() ||
      expiresAt - createdAt !== LOCAL_DEMO_CHALLENGE_TTL_MS
    ) {
      safeRemove(this.storage, LOCAL_DEMO_CHALLENGE_STORAGE_KEY);
      return authError("驗證碼已過期，請重新取得");
    }
    if (value.challengeId !== challengeId) {
      return authError("驗證要求不相符，請重新取得驗證碼");
    }
    if (code !== LOCAL_DEMO_OTP_CODE) {
      return authError("驗證碼不正確");
    }

    const session: StoredSession = {
      version: 1,
      scope: "local-demo",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LOCAL_DEMO_SESSION_TTL_MS).toISOString(),
      member: memberForEmail(value.email),
    };
    writeJson(this.storage, LOCAL_DEMO_SESSION_STORAGE_KEY, session);
    safeRemove(this.storage, LOCAL_DEMO_CHALLENGE_STORAGE_KEY);
    return { status: "authenticated", member: session.member, expiresAt: session.expiresAt };
  }

  async signOut(): Promise<void> {
    safeRemove(this.storage, LOCAL_DEMO_SESSION_STORAGE_KEY);
    safeRemove(this.storage, LOCAL_DEMO_CHALLENGE_STORAGE_KEY);
  }
}
