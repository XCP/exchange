import { NextResponse } from "next/server";

const BLOCKED_COMMERCIAL_CRAWLER = /(?:AhrefsBot|SemrushBot|MJ12bot|DotBot)/i;

export function middleware(request: Request) {
  if (!BLOCKED_COMMERCIAL_CRAWLER.test(request.headers.get("user-agent") ?? "")) return NextResponse.next();

  return new NextResponse("Forbidden", {
    status: 403,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
