export async function readRequestBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { body: await request.json(), isForm: false };
  }
  const formData = await request.formData();
  return { body: Object.fromEntries(formData.entries()), isForm: true };
}

export function formRedirect(request: Request, path: string) {
  return Response.redirect(new URL(path, request.url), 303);
}

export function formReturnRedirect(request: Request, body: Record<string, unknown>, fallbackPath: string) {
  const requestedPath = typeof body.return_to === "string" ? body.return_to : null;
  if (requestedPath?.startsWith("/") && !requestedPath.startsWith("//")) {
    return formRedirect(request, requestedPath);
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const refererUrl = new URL(referer);
    const requestUrl = new URL(request.url);
    if (refererUrl.origin === requestUrl.origin) {
      return Response.redirect(refererUrl, 303);
    }
  }

  return formRedirect(request, fallbackPath);
}
