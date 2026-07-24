import { requireAppSession, sessionPageKeys } from "@/lib/auth-session";

export async function GET(request: Request) {
  const auth = await requireAppSession(request);
  if (auth.response) return Response.json({ user: null });
  const session = auth.session;
  const pages = await sessionPageKeys(session);
  return Response.json({
    user: {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
      pages,
    },
  });
}

