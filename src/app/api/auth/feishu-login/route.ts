import { createSessionCookie } from "@/lib/auth-session";
import { createSupabaseServiceClient } from "@/lib/supabase";

type FeishuTokenResponse = {
  code?: number;
  access_token?: string;
  error?: string;
  error_description?: string;
};

type FeishuUserInfoResponse = {
  code?: number;
  msg?: string;
  data?: {
    open_id?: string;
    name?: string;
  };
};

function requireFeishuConfig() {
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
  return { appId, appSecret };
}

async function exchangeFeishuCodeForUserAccessToken(code: string) {
  const { appId, appSecret } = requireFeishuConfig();
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v2/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: appId,
      client_secret: appSecret,
      code,
    }),
  });
  const payload = await response.json().catch(() => ({})) as FeishuTokenResponse;
  if (!response.ok || payload.code !== 0 || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Feishu token exchange failed");
  }
  return payload.access_token;
}

async function getFeishuUserInfo(userAccessToken: string) {
  const response = await fetch("https://open.feishu.cn/open-apis/authen/v1/user_info", {
    method: "GET",
    headers: { authorization: `Bearer ${userAccessToken}` },
  });
  const payload = await response.json().catch(() => ({})) as FeishuUserInfoResponse;
  if (!response.ok || payload.code !== 0 || !payload.data?.open_id) {
    throw new Error(payload.msg || "Feishu user info failed");
  }
  return payload.data;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    if (!code) return Response.json({ error: "Missing Feishu authorization code" }, { status: 400 });

    const userAccessToken = await exchangeFeishuCodeForUserAccessToken(code);
    const feishuUser = await getFeishuUserInfo(userAccessToken);
    const openId = feishuUser.open_id!;

    const supabase = createSupabaseServiceClient();
    const { data: user, error } = await supabase
      .from("app_users")
      .select("id,username,display_name,role,status,feishu_user_id")
      .eq("feishu_user_id", openId)
      .single();

    if (error || !user) {
      return Response.json({ error: "当前飞书账号未绑定系统用户，请联系管理员在用户管理中绑定 Open ID。" }, { status: 401 });
    }
    if (user.status === "disabled") {
      return Response.json({ error: "当前系统账号已停用。" }, { status: 403 });
    }

    const responseUser = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };

    return Response.json(
      { user: responseUser },
      { headers: { "Set-Cookie": createSessionCookie(responseUser) } },
    );
  } catch {
    return Response.json({ error: "飞书免登失败，请重试或使用账号密码登录。" }, { status: 500 });
  }
}
