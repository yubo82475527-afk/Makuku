import crypto from "crypto";
import { createSessionCookie } from "@/lib/auth-session";
import { getFeishuDepartmentNamesByOpenId } from "@/lib/feishu";
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
    email?: string;
  };
};

type AppUserRecord = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  status: string | null;
  feishu_user_id: string | null;
  password_login_enabled: boolean | null;
  feishu_org_mismatch: boolean | null;
};

type AppUserByEmailRecord = AppUserRecord & {
  email: string | null;
};

const mobilePurpose = "mobile_h5";
const autoProvisionEnv = "FEISHU_H5_AUTO_PROVISION_ENABLED";

function requireFeishuConfig() {
  const appId = process.env.FEISHU_APP_ID?.trim();
  const appSecret = process.env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
  return { appId, appSecret };
}

function normalizeDisplayName(value: string | undefined) {
  return value?.trim() || "Feishu User";
}

function normalizeEmail(value: string | undefined) {
  const email = value?.trim().toLowerCase();
  return email || null;
}

function normalizeUsernameBase(value: string | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return normalized || "field_agent";
}

function isNoRowsError(error: { code?: string; message?: string } | null) {
  const message = error?.message ?? "";
  return error?.code === "PGRST116" || message.includes("0 rows") || message.includes("multiple (or no) rows returned");
}

function isMobileAutoProvisionEnabled() {
  const value = process.env[autoProvisionEnv];
  return value ? value.trim().toLowerCase() === "true" : true;
}

function hashPassword(password: string) {
  return `sha256:${crypto.createHash("sha256").update(password).digest("hex")}`;
}

function randomPassword() {
  return crypto.randomBytes(24).toString("hex");
}

function buildUsernameCandidates(name: string | undefined, openId: string) {
  const candidates = new Set<string>();
  const base = normalizeUsernameBase(name);
  const suffix = openId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const tail = suffix.slice(-6) || crypto.randomBytes(3).toString("hex");
  candidates.add(`${base}_${tail}`.slice(0, 32));
  candidates.add(`fs_${tail}`.slice(0, 32));
  return Array.from(candidates);
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

async function findAppUserByFeishuOpenId(openId: string) {
  const supabase = createSupabaseServiceClient();
  const result = await supabase
    .from("app_users")
    .select("id,username,display_name,role,status,feishu_user_id,password_login_enabled,feishu_org_mismatch")
    .eq("feishu_user_id", openId)
    .single();

  if (result.error?.message.includes("password_login_enabled") || result.error?.message.includes("feishu_org_mismatch")) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,role,status,feishu_user_id")
      .eq("feishu_user_id", openId)
      .single();
    return {
      data: legacy.data ? { ...legacy.data, password_login_enabled: true, feishu_org_mismatch: false } as AppUserRecord : null,
      error: legacy.error,
    };
  }

  return { data: result.data as AppUserRecord | null, error: result.error };
}

async function createFeishuOnlyUser(input: { openId: string; name?: string; email?: string }) {
  const supabase = createSupabaseServiceClient();
  const usernameCandidates = buildUsernameCandidates(input.name, input.openId);
  const displayName = normalizeDisplayName(input.name);
  const email = normalizeEmail(input.email);
  const passwordHash = hashPassword(randomPassword());

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const username = attempt < usernameCandidates.length
      ? usernameCandidates[attempt]
      : `fs_${input.openId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(-(6 + attempt), undefined) || crypto.randomBytes(4).toString("hex")}`.slice(0, 32);

    const { data, error } = await supabase
      .from("app_users")
      .insert({
        username,
        display_name: displayName,
        email,
        feishu_user_id: input.openId,
        password_hash: passwordHash,
        role: "field_agent",
        status: "enabled",
        disabled_at: null,
        password_login_enabled: false,
        feishu_org_mismatch: false,
      })
      .select("id,username,display_name,role,status,feishu_user_id,password_login_enabled,feishu_org_mismatch")
      .single();

    if (!error && data) return data as AppUserRecord;
    if (!error?.message.toLowerCase().includes("username") && !error?.message.toLowerCase().includes("duplicate")) {
      throw new Error(error?.message || "Failed to create Feishu user");
    }
  }

  throw new Error("Failed to generate unique username");
}

async function findAppUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return { data: null, error: null, multiple: false };

  const supabase = createSupabaseServiceClient();
  const result = await supabase
    .from("app_users")
    .select("id,username,display_name,email,role,status,feishu_user_id,password_login_enabled,feishu_org_mismatch")
    .eq("email", normalizedEmail)
    .limit(2);

  if (result.error?.message.includes("password_login_enabled") || result.error?.message.includes("feishu_org_mismatch")) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,email,role,status,feishu_user_id")
      .eq("email", normalizedEmail)
      .limit(2);
    const rows = (legacy.data ?? []).map((user) => ({ ...user, password_login_enabled: true, feishu_org_mismatch: false })) as AppUserByEmailRecord[];
    return {
      data: rows.length === 1 ? rows[0] : null,
      error: legacy.error,
      multiple: rows.length > 1,
    };
  }

  const rows = (result.data ?? []) as AppUserByEmailRecord[];
  return {
    data: rows.length === 1 ? rows[0] : null,
    error: result.error,
    multiple: rows.length > 1,
  };
}

async function bindFeishuOpenIdToExistingUser(userId: string, openId: string) {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("app_users")
    .update({
      feishu_user_id: openId,
      feishu_org_mismatch: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id,username,display_name,role,status,feishu_user_id,password_login_enabled,feishu_org_mismatch")
    .single();

  if (error?.message.includes("password_login_enabled") || error?.message.includes("feishu_org_mismatch")) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,role,status,feishu_user_id")
      .eq("id", userId)
      .single();
    if (legacy.error || !legacy.data) throw new Error(legacy.error?.message || "Failed to bind Feishu Open ID");
    return { ...legacy.data, password_login_enabled: true, feishu_org_mismatch: false } as AppUserRecord;
  }

  if (error || !data) throw new Error(error?.message || "Failed to bind Feishu Open ID");
  return data as AppUserRecord;
}

function normalizeOrganizationName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function resolveMatchedOrganizations(openId: string) {
  const departmentNames = await getFeishuDepartmentNamesByOpenId(openId);
  const normalizedNames = Array.from(new Set(departmentNames.map(normalizeOrganizationName).filter(Boolean)));
  if (normalizedNames.length === 0) {
    return { organizationIds: [] as string[], departmentNames };
  }

  const supabase = createSupabaseServiceClient();
  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("id,name,status")
    .eq("status", "active");

  if (error) throw new Error(error.message);

  const matchedOrganizations = (organizations ?? []).filter((organization) =>
    normalizedNames.includes(normalizeOrganizationName(String(organization.name ?? ""))));

  return {
    organizationIds: matchedOrganizations.map((organization) => String(organization.id)),
    departmentNames,
  };
}

async function replaceOrganizationsForUser(appUserId: string, organizationIds: string[]) {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase.rpc("replace_user_organization_members", {
    p_app_user_id: appUserId,
    p_organization_ids: organizationIds,
  });
  if (error) throw new Error(error.message);
}

async function updateFeishuOrgMismatch(appUserId: string, mismatch: boolean) {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("app_users")
    .update({
      feishu_org_mismatch: mismatch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appUserId);
  if (error && !error.message.includes("feishu_org_mismatch")) {
    throw new Error(error.message);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const purpose = String(body.purpose ?? "").trim();
    if (!code) return Response.json({ error: "Missing Feishu authorization code" }, { status: 400 });

    const userAccessToken = await exchangeFeishuCodeForUserAccessToken(code);
    const feishuUser = await getFeishuUserInfo(userAccessToken);
    const openId = feishuUser.open_id!;
    const isMobileH5 = purpose === mobilePurpose;

    const { data: existingUser, error } = await findAppUserByFeishuOpenId(openId);
    let user = existingUser;
    let matchedOrganizations: { organizationIds: string[]; departmentNames: string[] } | null = null;
    let organizationLookupFailed = false;

    if (error && !isNoRowsError(error)) {
      console.error("findAppUserByFeishuOpenId failed", {
        openId,
        error: error.message,
      });
      return Response.json({ error: "Failed to read existing user." }, { status: 500 });
    }

    if (!user && !isMobileH5) {
      return Response.json({ error: "Current Feishu account is not linked to a system user." }, { status: 401 });
    }

    if (isMobileH5) {
      if (!isMobileAutoProvisionEnabled()) {
        return Response.json({ error: "H5 Feishu auto provisioning is disabled." }, { status: 403 });
      }
      try {
        matchedOrganizations = await resolveMatchedOrganizations(openId);
      } catch (lookupError) {
        organizationLookupFailed = true;
        console.error("feishu organization lookup failed", {
          openId,
          error: lookupError instanceof Error ? lookupError.message : "Unknown error",
        });
      }
    }

    if (!user && isMobileH5) {
      const normalizedFeishuEmail = normalizeEmail(feishuUser.email);
      if (normalizedFeishuEmail) {
        const emailMatch = await findAppUserByEmail(normalizedFeishuEmail);
        if (emailMatch.error) {
          console.error("findAppUserByEmail failed", {
            email: normalizedFeishuEmail,
            error: emailMatch.error.message,
          });
          return Response.json({ error: "Failed to match existing user by email." }, { status: 500 });
        }
        if (emailMatch.multiple) {
          return Response.json({ error: "Multiple local users share this email. Please contact an administrator." }, { status: 409 });
        }
        if (emailMatch.data) {
          try {
            user = await bindFeishuOpenIdToExistingUser(emailMatch.data.id, openId);
          } catch (bindError) {
            console.error("bindFeishuOpenIdToExistingUser failed", {
              userId: emailMatch.data.id,
              openId,
              error: bindError instanceof Error ? bindError.message : "Unknown error",
            });
            return Response.json({ error: "Failed to bind existing user." }, { status: 500 });
          }
        }
      }
    }

    if (!user) {
      user = await createFeishuOnlyUser({
        openId,
        name: feishuUser.name,
        email: feishuUser.email,
      });
    }

    if (user.status === "disabled") {
      return Response.json({ error: "Current system account is disabled." }, { status: 403 });
    }

    if (isMobileH5) {
      if (organizationLookupFailed) {
        try {
          await updateFeishuOrgMismatch(user.id, true);
        } catch (mismatchError) {
          console.error("updateFeishuOrgMismatch failed", {
            appUserId: user.id,
            openId,
            error: mismatchError instanceof Error ? mismatchError.message : "Unknown error",
          });
        }
      } else if (!matchedOrganizations || matchedOrganizations.organizationIds.length === 0) {
        try {
          await updateFeishuOrgMismatch(user.id, true);
        } catch (mismatchError) {
          console.error("updateFeishuOrgMismatch failed", {
            appUserId: user.id,
            openId,
            error: mismatchError instanceof Error ? mismatchError.message : "Unknown error",
          });
        }
      } else {
        try {
          await replaceOrganizationsForUser(user.id, matchedOrganizations.organizationIds);
          await updateFeishuOrgMismatch(user.id, false);
        } catch (syncError) {
          console.error("replaceOrganizationsForUser failed", {
            appUserId: user.id,
            openId,
            organizationIds: matchedOrganizations.organizationIds,
            error: syncError instanceof Error ? syncError.message : "Unknown error",
          });
          try {
            await updateFeishuOrgMismatch(user.id, true);
          } catch (mismatchError) {
            console.error("updateFeishuOrgMismatch failed", {
              appUserId: user.id,
              openId,
              error: mismatchError instanceof Error ? mismatchError.message : "Unknown error",
            });
          }
        }
      }
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
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Feishu login failed" },
      { status: 500 },
    );
  }
}
