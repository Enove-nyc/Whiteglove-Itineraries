import { NextRequest, NextResponse } from "next/server";
import { accessToken, sameOrigin } from "@/lib/secure-access";
import { hasStoredPassword, identifySiteCode, passwordStorageAvailable, verifyAccessPassword } from "@/lib/access-passwords";
import { recordFailedAttempt, tooManyAttempts } from "@/lib/access-attempts";
import { accessGeneration, recordSignIn, whereFrom } from "@/lib/signin-log";
import { mintSiteAccess, PREVIEW_MINUTES, SITE_COOKIE } from "@/lib/site-access";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "That request did not come from this site." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { scope?: "admin" | "site"; password?: string } | null;
  if (!body || (body.scope !== "admin" && body.scope !== "site")) {
    return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
  }

  // Guessing a six-character password is only expensive if guessing is slow.
  const blocked = await tooManyAttempts(request, body.scope);
  if (blocked) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${blocked.minutes} minute${blocked.minutes === 1 ? "" : "s"}.` },
      { status: 429 },
    );
  }

  const password = body.password || "";
  const noSecret = NextResponse.json(
    { error: "This deployment has no session secret set, so it cannot sign you in. Set WHITE_GLOVE_SESSION_SECRET." },
    { status: 503 },
  );

  if (body.scope === "admin") {
    if (!(await verifyAccessPassword("admin", password))) {
      await recordFailedAttempt(request, "admin");
      // Local DX: distinguish "this server has no ADMIN_PASSWORD loaded" from a
      // wrong guess. The origin-main worktree often runs without `.env.local`.
      if (
        process.env.NODE_ENV !== "production" &&
        !process.env.ADMIN_PASSWORD?.trim() &&
        !(passwordStorageAvailable() && (await hasStoredPassword("admin")))
      ) {
        return NextResponse.json(
          {
            error:
              "This local server has no ADMIN_PASSWORD loaded. Put it in .env.local in this worktree and restart npm run dev.",
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
    }
    const token = accessToken("admin");
    // No signing secret means no cookie can be trusted, so none is issued.
    if (!token) return noSecret;
    await recordSignIn({ at: new Date().toISOString(), how: "admin code", ...whereFrom(request.headers) });
    const response = NextResponse.json({ ok: true });
    response.cookies.set("white_glove_admin", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // TWELVE HOURS, up from four. Four meant signing in three times over a
      // working day even without ever going idle. The idle timeout in
      // app/admin/layout.tsx is what actually protects an abandoned session.
      maxAge: 60 * 60 * 12,
      path: "/",
    });
    return response;
  }

  // Either site code opens the same door; they differ only in how long it
  // stays open. So the visitor is never asked which kind they were handed —
  // one field takes both.
  const kind = await identifySiteCode(password);
  if (!kind) {
    await recordFailedAttempt(request, "site");
    return NextResponse.json({ error: "That password is not correct." }, { status: 401 });
  }

  const generation = await accessGeneration();
  const minutes = kind === "preview" ? PREVIEW_MINUTES : undefined;
  const cookie = mintSiteAccess(generation, minutes);
  if (!cookie) return noSecret;

  await recordSignIn({
    at: new Date().toISOString(),
    how: kind === "preview" ? "five-minute code" : "full code",
    ...whereFrom(request.headers),
  });

  const response = NextResponse.json({
    ok: true,
    // So the page can say how long they have, rather than letting it lapse
    // silently halfway through what they came to look at.
    expiresInMinutes: minutes ?? null,
  });
  response.cookies.set(SITE_COOKIE, cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // The browser's own expiry is a convenience. The signed expiry inside the
    // cookie is what is actually enforced, on every request.
    maxAge: minutes ? minutes * 60 : 60 * 60 * 24 * 365,
    path: "/",
  });
  return response;
}
