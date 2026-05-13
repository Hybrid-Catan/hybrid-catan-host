import { NextResponse } from "next/server";
import os from "os";

export async function GET() {
  const interfaces = os.networkInterfaces();
  let lanIp = "localhost";

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
    if (lanIp !== "localhost") break;
  }

  return NextResponse.json({ lanIp });
}
