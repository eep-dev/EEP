import { NextResponse } from "next/server";

/** Legacy portal: subscription requires manual card entry. */
export async function POST() {
  return NextResponse.json(
    {
      error: "payment_required",
      message: "Complete subscription with a valid credit card. Agent checkout not supported.",
    },
    { status: 402 },
  );
}
