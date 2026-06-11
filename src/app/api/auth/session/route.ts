import { readSessionFromRequest } from "@/lib/auth-session";

export async function GET(request: Request) {
  const session = readSessionFromRequest(request);
  if (!session) return Response.json({ user: null });
  return Response.json({
    user: {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
    },
  });
}

