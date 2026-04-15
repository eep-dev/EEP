import { NextResponse } from "next/server";

/** Legacy portal: agents cannot authenticate without human credentials. */
export async function POST() {
  return NextResponse.json(
    { error: "unauthorized", message: "Invalid credentials or CAPTCHA required" },
    { status: 401 },
  );
}
