import { NextResponse, type NextRequest } from "next/server";

type RouteContext = { params: Promise<{ id: string }> };

/* --------------------------------------------------------- */
/* PATCH /api/scheduling/shifts/:id                          */
/* --------------------------------------------------------- */
export async function PATCH(_req: NextRequest, _context: RouteContext) {
  return NextResponse.json(
    { error: "Shift lifecycle writes must use the canonical shift API." },
    { status: 410 },
  );
}

/* --------------------------------------------------------- */
/* DELETE /api/scheduling/shifts/:id                         */
/* --------------------------------------------------------- */
export async function DELETE(_req: NextRequest, _context: RouteContext) {
  return NextResponse.json(
    { error: "Shift lifecycle writes must use the canonical shift API." },
    { status: 410 },
  );
}
