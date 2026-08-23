export type MemberProvider = "line" | "email_otp";

export type MemberSummary = {
  id: string;
  displayName: string;
  email: string | null;
  pictureUrl: string | null;
  emailVerified: boolean;
  providers: readonly MemberProvider[];
};

export type MemberSessionState =
  | { status: "checking" }
  | { status: "anonymous" }
  | { status: "authenticated"; member: MemberSummary; expiresAt: string }
  | {
      status: "unavailable";
      reason: "not_configured" | "offline";
      providers: readonly MemberProvider[];
    }
  | { status: "error"; message: string; retryable: boolean };

export type AuthCapabilities = {
  enabled: boolean;
  line: boolean;
  emailOtp: boolean;
};

export interface MemberGateway {
  getCapabilities(signal?: AbortSignal): Promise<AuthCapabilities>;
  getSession(signal?: AbortSignal): Promise<MemberSessionState>;
  startLineLogin(returnTo: string): void;
  requestEmailOtp(email: string): Promise<{
    challengeId: string;
    maskedDestination: string;
    expiresAt: string;
    retryAfterSeconds: number;
  }>;
  verifyEmailOtp(challengeId: string, code: string): Promise<MemberSessionState>;
  signOut(): Promise<void>;
}

export class UnavailableMemberGateway implements MemberGateway {
  async getCapabilities(): Promise<AuthCapabilities> {
    return { enabled: false, line: false, emailOtp: false };
  }

  async getSession(): Promise<MemberSessionState> {
    return { status: "unavailable", reason: "not_configured", providers: [] };
  }

  startLineLogin(): never {
    throw new Error("會員驗證服務尚未設定");
  }

  async requestEmailOtp(): Promise<never> {
    throw new Error("Email 驗證服務尚未設定");
  }

  async verifyEmailOtp(): Promise<MemberSessionState> {
    return { status: "unavailable", reason: "not_configured", providers: [] };
  }

  async signOut(): Promise<void> {
    // 尚無伺服器 Session，不需要模擬登出。
  }
}

export type DeliveryMethod = "home_delivery" | "convenience_store" | "appointment";

export type DeviceCheckoutProfile = {
  contactName: string;
  phone: string;
  email: string;
  lineId: string;
  deliveryMethod: DeliveryMethod;
  address: string;
};

export type DeviceProfileEnvelope = {
  version: 1;
  scope: "device-only";
  siteCode: string;
  consentVersion: "remember-checkout-v1";
  savedAt: string;
  expiresAt: string;
  value: DeviceCheckoutProfile;
};

export type DeviceOrderItem = {
  name: string;
  quantity: number;
};

export type DeviceOrderReference = {
  orderNumber: string;
  status: string;
  total: number;
  currency: "TWD";
  createdAt: string;
  reservedUntil: string | null;
  items: readonly DeviceOrderItem[];
};

export type CartMergeItem = { productId: string; quantity: number };

export type CartMergeRequest = {
  idempotencyKey: string;
  localCartId: string;
  expectedServerRevision?: string;
  items: readonly CartMergeItem[];
};

export type CartMergeIssue = {
  productId: string;
  reason: "unavailable" | "purchase_limit" | "stock_reduced" | "product_removed";
  requestedQuantity: number;
  acceptedQuantity: number;
};

export type CartMergeResult = {
  revision: string;
  items: readonly CartMergeItem[];
  issues: readonly CartMergeIssue[];
};

export interface MemberCommerceGateway {
  getCart(signal?: AbortSignal): Promise<CartMergeResult>;
  mergeDeviceCart(input: CartMergeRequest): Promise<CartMergeResult>;
  listOrders(signal?: AbortSignal): Promise<readonly DeviceOrderReference[]>;
}
