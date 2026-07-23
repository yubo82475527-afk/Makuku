type FeishuTenantTokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
};

type FeishuSendMessageResponse = {
  code?: number;
  msg?: string;
  data?: {
    message_id?: string;
  };
};

type FeishuUploadImageResponse = {
  code?: number;
  msg?: string;
  data?: {
    image_key?: string;
  };
};

type FeishuDirectoryUserGetResponse = {
  code?: number;
  msg?: string;
  data?: {
    user?: {
      department_ids?: string[];
    };
    department_ids?: string[];
  };
};

type FeishuDepartmentBatchResponse = {
  code?: number;
  msg?: string;
  data?: {
    items?: Array<{
      department_id?: string;
      open_department_id?: string;
      name?: string;
    }>;
    department_infos?: Array<{
      department_id?: string;
      open_department_id?: string;
      name?: string;
    }>;
  };
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

type FeishuDirectoryUser = NonNullable<NonNullable<FeishuBatchGetIdResponse["data"]>["user_list"]>[number];
type FeishuDirectoryUserList = FeishuDirectoryUser[];

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

function summarizeFeishuUsers(users: FeishuDirectoryUserList | undefined) {
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

export type FeishuReceiveIdType = "open_id" | "chat_id";

export async function sendFeishuCardMessage(input: {
  receiveIdType: FeishuReceiveIdType;
  receiveId: string;
  card: Record<string, unknown>;
}) {
  const receiveId = input.receiveId.trim();
  if (!receiveId) throw new Error("Missing Feishu receive id");

  const content = JSON.stringify(input.card);
  const token = await getTenantAccessToken();
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${input.receiveIdType}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: "interactive",
      content,
    }),
  });
  const payload = await response.json().catch(() => ({})) as FeishuSendMessageResponse;
  if (!response.ok || payload.code !== 0 || !payload.data?.message_id) {
    console.error("sendFeishuCardMessage failed", {
      receiveIdType: input.receiveIdType,
      receiveId,
      content,
      httpStatus: response.status,
      feishuCode: payload.code ?? null,
      feishuMsg: payload.msg ?? null,
    });
    const details = [
      `http_status=${response.status}`,
      `feishu_code=${String(payload.code ?? "unknown")}`,
      `feishu_msg=${payload.msg ?? "unknown"}`,
    ];
    throw new Error(`Failed to send Feishu card message; ${details.join("; ")}`);
  }
  return payload.data.message_id;
}

export async function uploadFeishuMessageImage(input: {
  bytes: Uint8Array;
  filename?: string;
}) {
  const token = await getTenantAccessToken();
  const form = new FormData();
  form.set("image_type", "message");
  form.set("image", new Blob([Buffer.from(input.bytes)], { type: "image/png" }), input.filename ?? "report-preview.png");

  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/images", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as FeishuUploadImageResponse;
  if (!response.ok || payload.code !== 0 || !payload.data?.image_key) {
    throw new Error(payload.msg || "Failed to upload Feishu image");
  }
  return payload.data.image_key;
}

export async function sendFeishuImageMessage(input: {
  receiveIdType: FeishuReceiveIdType;
  receiveId: string;
  imageKey: string;
}) {
  const receiveId = input.receiveId.trim();
  if (!receiveId) throw new Error("Missing Feishu receive id");

  const token = await getTenantAccessToken();
  const response = await fetch(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${input.receiveIdType}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: "image",
      content: JSON.stringify({ image_key: input.imageKey }),
    }),
  });
  const payload = await response.json().catch(() => ({})) as FeishuSendMessageResponse;
  if (!response.ok || payload.code !== 0 || !payload.data?.message_id) {
    throw new Error(payload.msg || "Failed to send Feishu image message");
  }
  return payload.data.message_id;
}

function chunk<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

export type FeishuDepartment = {
  id: string;
  name: string;
};

export async function getFeishuDepartmentsByOpenId(openId: string): Promise<FeishuDepartment[]> {
  const normalizedOpenId = openId.trim();
  if (!normalizedOpenId) throw new Error("Missing Feishu open_id");

  const token = await getTenantAccessToken();
  const userUrl = new URL(`https://open.feishu.cn/open-apis/contact/v3/users/${encodeURIComponent(normalizedOpenId)}`);
  userUrl.searchParams.set("user_id_type", "open_id");
  const userResponse = await fetch(userUrl, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  const userPayload = await userResponse.json().catch(() => ({})) as FeishuDirectoryUserGetResponse;
  if (!userResponse.ok || userPayload.code !== 0) {
    throw new Error(userPayload.msg || "Failed to fetch Feishu user departments");
  }

  const departmentIds = uniqueNonEmpty([
    ...(userPayload.data?.user?.department_ids ?? []),
    ...(userPayload.data?.department_ids ?? []),
  ]);
  if (departmentIds.length === 0) return [];

  const departments: FeishuDepartment[] = [];
  for (const ids of chunk(departmentIds, 50)) {
    const departmentUrl = new URL("https://open.feishu.cn/open-apis/contact/v3/departments/batch");
    departmentUrl.searchParams.set("department_id_type", "open_department_id");
    for (const id of ids) {
      departmentUrl.searchParams.append("department_ids", id);
    }

    const departmentResponse = await fetch(departmentUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
    });
    const departmentPayload = await departmentResponse.json().catch(() => ({})) as FeishuDepartmentBatchResponse;
    if (!departmentResponse.ok || departmentPayload.code !== 0) {
      throw new Error(departmentPayload.msg || "Failed to fetch Feishu department details");
    }

    const items = departmentPayload.data?.items ?? departmentPayload.data?.department_infos ?? [];
    for (const item of items) {
      const id = String(item.open_department_id ?? item.department_id ?? "").trim();
      const name = String(item.name ?? "").trim();
      if (!id || !name) continue;
      departments.push({ id, name });
    }
  }

  const seen = new Set<string>();
  return departments.filter((department) => {
    if (seen.has(department.id)) return false;
    seen.add(department.id);
    return true;
  });
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
