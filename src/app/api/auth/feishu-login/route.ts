import crypto from "crypto";
import { createSessionCookie } from "@/lib/auth-session";
import { getFeishuDepartmentsByOpenId, type FeishuDepartment } from "@/lib/feishu";
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

type OrganizationAssignmentMethod = "feishu_auto" | "manual" | null;

type AppUserRecord = {
  id: string;
  username: string;
  display_name: string;
  role: string;
  status: string | null;
  feishu_user_id: string | null;
  password_login_enabled: boolean | null;
  feishu_org_mismatch: boolean | null;
  organization_assignment_method: OrganizationAssignmentMethod;
};

const appUserSelectFields = "id,username,display_name,role,status,feishu_user_id,password_login_enabled,feishu_org_mismatch,organization_assignment_method";

function withDefaultAssignmentMethod<T extends { organization_assignment_method?: OrganizationAssignmentMethod | null }>(
  user: T,
): T & { organization_assignment_method: OrganizationAssignmentMethod } {
  return {
    ...user,
    organization_assignment_method: user.organization_assignment_method ?? null,
  };
}

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

function isMissingOrgAssignmentColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("organization_assignment_method")
    || message.includes("feishu_org_ids")
    || message.includes("feishu_org_names")
    || message.includes("password_login_enabled")
    || message.includes("feishu_org_mismatch");
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
    .select(appUserSelectFields)
    .eq("feishu_user_id", openId)
    .single();

  if (isMissingOrgAssignmentColumnError(result.error)) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,role,status,feishu_user_id")
      .eq("feishu_user_id", openId)
      .single();
    return {
      data: legacy.data
        ? withDefaultAssignmentMethod({
          ...legacy.data,
          password_login_enabled: true,
          feishu_org_mismatch: false,
          organization_assignment_method: null,
        }) as AppUserRecord
        : null,
      error: legacy.error,
    };
  }

  return {
    data: result.data ? withDefaultAssignmentMethod(result.data as AppUserRecord) : null,
    error: result.error,
  };
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
        organization_assignment_method: null,
      })
      .select(appUserSelectFields)
      .single();

    if (!error && data) return withDefaultAssignmentMethod(data as AppUserRecord);
    if (isMissingOrgAssignmentColumnError(error)) {
      const legacy = await supabase
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
      if (!legacy.error && legacy.data) {
        return withDefaultAssignmentMethod({
          ...legacy.data,
          organization_assignment_method: null,
        }) as AppUserRecord;
      }
      if (!legacy.error?.message.toLowerCase().includes("username") && !legacy.error?.message.toLowerCase().includes("duplicate")) {
        throw new Error(legacy.error?.message || "Failed to create Feishu user");
      }
      continue;
    }
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
    .select(`${appUserSelectFields},email`)
    .eq("email", normalizedEmail)
    .limit(2);

  if (isMissingOrgAssignmentColumnError(result.error)) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,email,role,status,feishu_user_id")
      .eq("email", normalizedEmail)
      .limit(2);
    const rows = (legacy.data ?? []).map((user) => withDefaultAssignmentMethod({
      ...user,
      password_login_enabled: true,
      feishu_org_mismatch: false,
      organization_assignment_method: null,
    })) as AppUserByEmailRecord[];
    return {
      data: rows.length === 1 ? rows[0] : null,
      error: legacy.error,
      multiple: rows.length > 1,
    };
  }

  const rows = ((result.data ?? []) as AppUserByEmailRecord[]).map((user) => withDefaultAssignmentMethod(user));
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
    .select(appUserSelectFields)
    .single();

  if (isMissingOrgAssignmentColumnError(error)) {
    const legacy = await supabase
      .from("app_users")
      .select("id,username,display_name,role,status,feishu_user_id")
      .eq("id", userId)
      .single();
    if (legacy.error || !legacy.data) throw new Error(legacy.error?.message || "Failed to bind Feishu Open ID");
    return withDefaultAssignmentMethod({
      ...legacy.data,
      password_login_enabled: true,
      feishu_org_mismatch: false,
      organization_assignment_method: null,
    }) as AppUserRecord;
  }

  if (error || !data) throw new Error(error?.message || "Failed to bind Feishu Open ID");
  return withDefaultAssignmentMethod(data as AppUserRecord);
}

function normalizeOrganizationName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function canAutoAssignOrganizations(method: OrganizationAssignmentMethod) {
  return method === null || method === "feishu_auto";
}

async function resolveMatchedOrganizations(openId: string) {
  const departments = await getFeishuDepartmentsByOpenId(openId);
  const normalizedNames = Array.from(new Set(departments.map((department) => normalizeOrganizationName(department.name)).filter(Boolean)));
  if (normalizedNames.length === 0) {
    return { organizationIds: [] as string[], departments };
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
    departments,
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

async function updateFeishuOrgSnapshot(
  appUserId: string,
  input: {
    departments: FeishuDepartment[] | null;
    mismatch: boolean;
    assignmentMethod?: OrganizationAssignmentMethod;
  },
) {
  const supabase = createSupabaseServiceClient();
  const payload: Record<string, unknown> = {
    feishu_org_mismatch: input.mismatch,
    updated_at: new Date().toISOString(),
  };
  if (input.departments) {
    payload.feishu_org_ids = input.departments.map((department) => department.id);
    payload.feishu_org_names = input.departments.map((department) => department.name);
  }
  if (input.assignmentMethod !== undefined) {
    payload.organization_assignment_method = input.assignmentMethod;
  }

  const { error } = await supabase
    .from("app_users")
    .update(payload)
    .eq("id", appUserId);

  if (error && isMissingOrgAssignmentColumnError(error)) {
    const legacy = await supabase
      .from("app_users")
      .update({
        feishu_org_mismatch: input.mismatch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appUserId);
    if (legacy.error && !legacy.error.message.includes("feishu_org_mismatch")) {
      throw new Error(legacy.error.message);
    }
    return;
  }

  if (error) throw new Error(error.message);
}

async function syncUserOrganizationsFromFeishu(user: AppUserRecord, openId: string) {
  let departments: FeishuDepartment[] = [];
  let organizationIds: string[] = [];
  let organizationLookupFailed = false;

  try {
    const matched = await resolveMatchedOrganizations(openId);
    departments = matched.departments;
    organizationIds = matched.organizationIds;
  } catch (lookupError) {
    organizationLookupFailed = true;
    console.error("feishu organization lookup failed", {
      openId,
      error: lookupError instanceof Error ? lookupError.message : "Unknown error",
    });
  }

  const mismatch = organizationLookupFailed || organizationIds.length === 0;
  const allowAutoAssign = canAutoAssignOrganizations(user.organization_assignment_method);

  if (allowAutoAssign && !organizationLookupFailed && organizationIds.length > 0) {
    try {
      await replaceOrganizationsForUser(user.id, organizationIds);
      await updateFeishuOrgSnapshot(user.id, {
        departments,
        mismatch: false,
        assignmentMethod: "feishu_auto",
      });
      return;
    } catch (syncError) {
      console.error("replaceOrganizationsForUser failed", {
        appUserId: user.id,
        openId,
        organizationIds,
        error: syncError instanceof Error ? syncError.message : "Unknown error",
      });
      try {
        await updateFeishuOrgSnapshot(user.id, { departments, mismatch: true });
      } catch (snapshotError) {
        console.error("updateFeishuOrgSnapshot failed", {
          appUserId: user.id,
          openId,
          error: snapshotError instanceof Error ? snapshotError.message : "Unknown error",
        });
      }
      return;
    }
  }

  try {
    if (organizationLookupFailed) {
      await updateFeishuOrgSnapshot(user.id, { departments: null, mismatch: true });
    } else {
      await updateFeishuOrgSnapshot(user.id, { departments, mismatch });
    }
  } catch (snapshotError) {
    console.error("updateFeishuOrgSnapshot failed", {
      appUserId: user.id,
      openId,
      error: snapshotError instanceof Error ? snapshotError.message : "Unknown error",
    });
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

    if (isMobileH5 && !isMobileAutoProvisionEnabled()) {
      return Response.json({ error: "H5 Feishu auto provisioning is disabled." }, { status: 403 });
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

    await syncUserOrganizationsFromFeishu(user, openId);

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
