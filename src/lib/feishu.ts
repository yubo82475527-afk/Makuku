type FeishuTenantTokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
};

type FeishuBatchGetIdResponse = {
  code?: number;
  msg?: string;
  data?: {
    user_list?: Array<{
      email?: string;
      user_id?: string;
      open_id?: string;
      union_id?: string;
    }>;
  };
};

function requireFeishuConfig() {
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
  }
  return { appId, appSecret };
}

async function getTenantAccessToken() {
  const { appId, appSecret } = requireFeishuConfig();
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });
  const payload = await response.json().catch(() => ({})) as FeishuTenantTokenResponse;
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(payload.msg || "Failed to get Feishu tenant access token");
  }
  return payload.tenant_access_token;
}

export async function resolveFeishuOpenIdByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Missing user email");

  const token = await getTenantAccessToken();
  const response = await fetch("https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      emails: [normalizedEmail],
      include_resigned: true,
    }),
  });
  const payload = await response.json().catch(() => ({})) as FeishuBatchGetIdResponse;
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.msg || "Failed to resolve Feishu Open ID");
  }

  const matchedUser = payload.data?.user_list?.find((user) => user.email?.toLowerCase() === normalizedEmail)
    ?? payload.data?.user_list?.[0];
  const openId = matchedUser?.open_id ?? matchedUser?.user_id;
  if (!openId) {
    throw new Error("No Feishu user found for this email, or the app has no permission to read this user");
  }
  return openId;
}
