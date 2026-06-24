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

type ResolveFeishuOpenIdResult = {
  openId: string;
  diagnostics: {
    queryEmail: string;
    httpStatus: number;
    feishuCode: number | null;
    feishuMsg: string | null;
    matchedUsers: number;
    matchedSummary: ReturnType<typeof summarizeFeishuUsers>;
    logId: string | null;
  };
};

function summarizeFeishuUsers(users: FeishuBatchGetIdResponse["data"]["user_list"]) {
  return (users ?? []).map((user) => ({
    email: user.email ?? "",
    has_open_id: Boolean(user.open_id),
    has_user_id: Boolean(user.user_id),
    has_union_id: Boolean(user.union_id),
  }));
}

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
  const logId = response.headers.get("x-tt-logid");
  const payload = await response.json().catch(() => ({})) as FeishuBatchGetIdResponse;
  if (!response.ok || payload.code !== 0) {
    console.error("resolveFeishuOpenIdByEmail failed", {
      queryEmail: normalizedEmail,
      httpStatus: response.status,
      feishuCode: payload.code ?? null,
      feishuMsg: payload.msg ?? null,
      matchedUsers: payload.data?.user_list?.length ?? 0,
      matchedSummary: summarizeFeishuUsers(payload.data?.user_list),
      logId,
    });
    const errorParts = [
      "Feishu batch_get_id failed",
      `query_email=${normalizedEmail}`,
      `http_status=${response.status}`,
      `feishu_code=${String(payload.code ?? "unknown")}`,
      `feishu_msg=${payload.msg ?? "unknown"}`,
      `x_tt_logid=${logId ?? "unknown"}`,
    ];
    throw new Error(errorParts.join("; "));
  }

  const userList = payload.data?.user_list ?? [];
  const matchedUser = userList.find((user) => user.email?.toLowerCase() === normalizedEmail)
    ?? payload.data?.user_list?.[0];
  const openId = matchedUser?.open_id ?? matchedUser?.user_id;
  if (!openId) {
    console.error("resolveFeishuOpenIdByEmail failed", {
      queryEmail: normalizedEmail,
      httpStatus: response.status,
      feishuCode: payload.code ?? null,
      feishuMsg: payload.msg ?? null,
      matchedUsers: userList.length,
      matchedSummary: summarizeFeishuUsers(userList),
      logId,
    });
    const diagnostics = [
      "Feishu user lookup returned no open_id",
      `query_email=${normalizedEmail}`,
      `matched_users=${userList.length}`,
      `matched_summary=${JSON.stringify(summarizeFeishuUsers(userList))}`,
      `x_tt_logid=${logId ?? "unknown"}`,
      "Possible causes: user not in this tenant, app directory scope missing this user, or email does not match the Feishu directory record",
    ];
    throw new Error(diagnostics.join("; "));
  }
  const result: ResolveFeishuOpenIdResult = {
    openId,
    diagnostics: {
      queryEmail: normalizedEmail,
      httpStatus: response.status,
      feishuCode: payload.code ?? null,
      feishuMsg: payload.msg ?? null,
      matchedUsers: userList.length,
      matchedSummary: summarizeFeishuUsers(userList),
      logId,
    },
  };
  console.info("resolveFeishuOpenIdByEmail success", result.diagnostics);
  return result;
}
