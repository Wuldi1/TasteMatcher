import fetch from "node-fetch";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:8080/api";
const EMAIL = "galrubin15@gmail.com";
const VERIFICATION_CODE = "000000";

export async function login() {
  console.log("🔐 Logging in...");
  
  // Step 1: Request verification code
  const initRes = await fetch(`${API_BASE_URL}/auth/login/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL }),
  });
  
  if (!initRes.ok) {
    throw new Error(`Login init failed: ${initRes.statusText}`);
  }
  
  console.log("📧 Verification code requested");
  
  // Step 2: Verify code and get token
  const verifyRes = await fetch(`${API_BASE_URL}/auth/login/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      email: EMAIL, 
      code: VERIFICATION_CODE 
    }),
  });
  
  if (!verifyRes.ok) {
    throw new Error(`Verification failed: ${verifyRes.statusText}`);
  }
  
  const { token } = await verifyRes.json();
  console.log("✅ Logged in successfully");
  
  return token;
}
