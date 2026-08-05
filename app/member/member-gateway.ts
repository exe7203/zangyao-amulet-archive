import { UnavailableMemberGateway } from "../../shared/member-contract";

// 正式 LINE Login／Email OTP 啟用後，只需替換這個 adapter。
// 此版本刻意不建立假帳號、假 token 或瀏覽器端 Session。
export const memberGateway = new UnavailableMemberGateway();
