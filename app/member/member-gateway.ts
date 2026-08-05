import {
  UnavailableMemberGateway,
  type MemberGateway,
} from "../../shared/member-contract";
import {
  LocalDemoMemberGateway,
  type LocalDemoMemberGatewayOptions,
  type SessionStorageLike,
} from "./local-demo-gateway";

export function isLocalDemoHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" ||
    normalized === "::1" || normalized === "[::1]";
}

export function createMemberGateway(
  hostname: string,
  storage?: SessionStorageLike | null,
  options: LocalDemoMemberGatewayOptions = {},
): MemberGateway {
  return isLocalDemoHostname(hostname) && storage
    ? new LocalDemoMemberGateway(storage, options)
    : new UnavailableMemberGateway();
}

function browserGateway() {
  if (typeof window === "undefined" || !isLocalDemoHostname(window.location.hostname)) {
    return new UnavailableMemberGateway();
  }
  try {
    return createMemberGateway(window.location.hostname, window.sessionStorage);
  } catch {
    return new UnavailableMemberGateway();
  }
}

// The delegate is resolved when each client action runs so SSR never creates a
// browser session and non-local deployments always retain the unavailable gate.
export const memberGateway: MemberGateway = {
  getCapabilities: (signal) => browserGateway().getCapabilities(signal),
  getSession: (signal) => browserGateway().getSession(signal),
  startLineLogin: (returnTo) => browserGateway().startLineLogin(returnTo),
  requestEmailOtp: (email) => browserGateway().requestEmailOtp(email),
  verifyEmailOtp: (challengeId, code) => browserGateway().verifyEmailOtp(challengeId, code),
  signOut: () => browserGateway().signOut(),
};
