let offer = {};
let answer = {};

export async function POST(req: { json: () => any; }) {
    const body = await req.json();

    if (body.type === "offer") {
        offer = body.data;
    }

    if (body.type === "answer") {
        answer = body.data;
    }

    return Response.json({ ok: true });
}

export async function GET() {
    return Response.json({ offer, answer });
}