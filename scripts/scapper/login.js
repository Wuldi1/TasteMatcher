import fetch from "node-fetch";
import readline from "node:readline/promises";

/**
 * login(apiBaseUrl, email, verificationCode)
 * - apiBaseUrl: base API url, e.g. http://localhost:8080 or https:/.tastematcher.art
 * - email: user email for login
 */
export async function login(
  apiBaseUrl = "http://localhost:8080",
  email = "galrubin15@gmail.com",
) {
  console.log(`🔐 Logging in as ${email} against ${apiBaseUrl}`);

  // Step 1: Request verification code
  const initRes = await fetch(`${apiBaseUrl}/auth/login/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!initRes.ok) {
    const txt = await initRes.text().catch(() => "");
    throw new Error(`Login init failed: ${initRes.statusText} - ${txt}`);
  }

  console.log("📧 Verification code requested");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const defaultCode = verificationCode ?? "000000";
  const inputCode = await rl.question(
    `Enter verification code (default ${defaultCode}): `,
  );
  rl.close();
  const code = inputCode.trim() || defaultCode;

  // Step 2: Verify code and get token
  const verifyRes = await fetch(`${apiBaseUrl}/auth/login/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      code,
    }),
  });

  if (!verifyRes.ok) {
    const txt = await verifyRes.text().catch(() => "");
    throw new Error(`Verification failed: ${verifyRes.statusText} - ${txt}`);
  }

  const payload = await verifyRes.json();
  const token = payload.token;
  if (!token) {
    throw new Error("No token returned from verification endpoint");
  }

  console.log("✅ Logged in successfully");
  return token;
}
