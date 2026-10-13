export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Could not switch products</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;min-height:100vh;place-items:center;background:#0b0b0c;color:#f4f4f5}
  main{max-width:28rem;padding:1.5rem}
  a{display:inline-block;margin:.5rem .75rem 0 0;padding:.5rem .9rem;border-radius:.5rem;border:1px solid #52525b;color:inherit;text-decoration:none}
  @media (prefers-color-scheme: light){body{background:#fafafa;color:#18181b}a{border-color:#a1a1aa}}
</style>
</head>
<body>
<main>
  <h1>Could not switch products</h1>
  <p>We couldn't carry your sign-in over automatically. This site may still be signed in to a different account, so check which account you are using before continuing.</p>
  <a href="/sign-in">Sign in</a>
  <a href="/">Continue</a>
</main>
</body>
</html>`;

/**
 * Landing page for every failed cross-host handoff. It needs an explicit click,
 * unlike /sign-in, which silently resumes whatever session this host already
 * holds. Static content only; nothing from the request is reflected.
 */
export async function GET() {
  return new Response(PAGE, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
