import { createSupabaseServiceClient } from "@/lib/supabase";
import { createSessionCookie, isAllowedAdminRole } from "@/lib/auth-session";
import crypto from "crypto";

const DEMO_USER = {
  id: "demo-field-agent",
  username: "demo",
  displayName: "Demo Field Agent",
  role: "field_agent",
};

function isMissingTableError(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("Could not find the table"));
}

function isUserStatusColumnError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  return message.includes("status") || message.includes("schema cache");
}

function canUseLocalDemoLogin(username: string, password: string) {
  return process.env.NODE_ENV !== "production" && username === "demo" && password === "demo123";
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
      .select("id, username, password_hash, display_name, role, status")
      .eq("username", username)
      .single();

    if (isUserStatusColumnError(error)) {
      const legacy = await supabase
        .from("app_users")
        .select("id, username, password_hash, display_name, role")
        .eq("username", username)
        .single();
      user = legacy.data ? { ...legacy.data, status: "enabled" } : null;
      error = legacy.error;
    }

    if (isMissingTableError(error) && canUseLocalDemoLogin(username, password)) {
      if (purpose === "pc_console" && !isAllowedAdminRole(DEMO_USER.role)) {
        return Response.json({ error: "Manager or admin account required" }, { status: 403 });
      }
      return Response.json(
        { user: DEMO_USER },
        { headers: { "Set-Cookie": createSessionCookie({ id: DEMO_USER.id, username: DEMO_USER.username, displayName: DEMO_USER.displayName, role: DEMO_USER.role }) } },
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

    if (purpose === "pc_console" && !isAllowedAdminRole(responseUser.role)) {
      return Response.json({ error: "Manager or admin account required" }, { status: 403 });
    }

    return Response.json(
      { user: responseUser },
      { headers: { "Set-Cookie": createSessionCookie(responseUser) } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
