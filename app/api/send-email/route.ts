// /app/api/send-email/route.ts

import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { to, subject, text } = body;

    if (!to || !subject || !text) {
      return NextResponse.json(
        { error: "Missing required fields (to, subject, text)" },
        { status: 400 }
      );
    }

    const { data, error } = await resend.emails.send({
      from: "Calvary Call Sheet <onboarding@resend.dev>", // safe default for now
      to,
      subject,
      text,
    });

    if (error) {
      console.error("Resend error:", error);

      return NextResponse.json(
        { error: "Failed to send email" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("Email route error:", err);

    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}