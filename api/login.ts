// api/login.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { password } = req.body || {};
  if (password && password === process.env.SITE_PASSWORD) {
    const token = crypto.createHash("sha256").update(password).digest("hex");
    res.setHeader("Set-Cookie", `site_auth=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    res.writeHead(302, { Location: "/" });
    res.end();
  } else {
    res.writeHead(302, { Location: "/login.html" });
    res.end();
  }
}
