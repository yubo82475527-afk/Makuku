import { createSupabaseServiceClient } from "@/lib/supabase";
import { createSessionCookie } from "@/lib/auth-session";
import { roleCanAccessPc } from "@/lib/role-access";
import crypto from "crypto";

const LOCAL_DEMO_USERS = [
  {
    id: "demo-field-agent",
    username: "demo",
    displayName: "Demo Field Agent",
    role: "field_agent",
  },
  {
    id: "demo-manager",
    username: "demo-manager",
    displayName: "Demo Manager",
    role: "manager",
  },
  {
    id: "demo-admin",
    username: "demo-admin",
    displayName: "Demo Admin",
    role: "admin",
  },
] as const;

function isMissingTableError(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("Could not find the table"));
}

function isUserStatusColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("status") || message.includes("schema cache");
}

function getLocalDemoUser(username: string, password: string) {
  if (process.env.NODE_ENV === "production" || password !== "demo123") return null;
  return LOCAL_DEMO_USERS.find((item) => item.username === username) ?? null;
}

// Simple password comparison for development
// For production: install bcryptjs and use real bcrypt hashes
async function comparePassword(password: string, hash: string): Promise<boolean> {
  // Support sha256 hashes for development: "sha256:<hex>"
  if (hash.startsWith("sha256:")) {
    const expected = hash.slice(7);
    const actual = crypto.createHash("sha256").update(password).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
  }

  // For bcrypt hashes, you need to install bcryptjs:
  // npm install bcryptjs @types/bcryptjs
  // Then uncomment the code below:
  /*
  const bcrypt = await import("bcryptjs");
  return await bcrypt.compare(password, hash);
  */

  throw new Error("Unsupported hash format. Use sha256:<hex> or install bcryptjs for bcrypt support.");
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const purpose = String(body.purpose ?? "").trim();

    if (!username || !password) {
      return Response.json({ error: "Username and password are required" }, { status: 400 });
    }

    const supabase = createSupabaseServiceClient();
    let { data: user, error } = await supabase
      .from("app_users")
      .select("id, username, password_hash, display_name, role, status, password_login_enabled")
      .eq("username", username)
      .single();

    if (isUserStatusColumnError(error) || error?.message?.includes("password_login_enabled")) {
      const legacy = await supabase
        .from("app_users")
        .select("id, username, password_hash, display_name, role")
        .eq("username", username)
        .single();
      user = legacy.data ? { ...legacy.data, status: "enabled", password_login_enabled: true } : null;
      error = legacy.error;
    }

    const localDemoUser = getLocalDemoUser(username, password);

    if (localDemoUser && (isMissingTableError(error) || error || !user)) {
      if (purpose === "pc_console" && !isAllowedAdminRole(localDemoUser.role)) {
        return Response.json({ error: "Manager or admin account required" }, { status: 403 });
      }
      return Response.json(
        { user: localDemoUser },
        {
          headers: {
            "Set-Cookie": createSessionCookie({
              id: localDemoUser.id,
              username: localDemoUser.username,
              displayName: localDemoUser.displayName,
              role: localDemoUser.role,
            }),
          },
        },
      );
    }

    if (isMissingTableError(error)) {
      return Response.json(
        { error: "Login is not configured: Supabase table public.app_users is missing." },
        { status: 503 },
      );
    }

    if (error || !user) {
      return Response.json({ error: "Invalid username or password" }, { status: 401 });
    }

    if (user.status === "disabled") {
      return Response.json({ error: "Account is disabled" }, { status: 403 });
    }

    if (user.password_login_enabled === false) {
      return Response.json({ error: "该账号仅支持飞书登录" }, { status: 403 });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return Response.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const responseUser = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };

    if (purpose === "pc_console" && !(await roleCanAccessPc(responseUser.role))) {
      return Response.json({ error: "PC console access required" }, { status: 403 });
    }

    return Response.json(
      { user: responseUser },
      { headers: { "Set-Cookie": createSessionCookie(responseUser) } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
