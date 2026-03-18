import { NextRequest, NextResponse } from "next/server";
import { routes } from "@/types/routes";
import { checkRolePermission } from "@/lib/auth/permissions";

export async function hasToBeLoggedOutMiddleware(request: NextRequest, session: any) {
  if (session) {
    const role = session.user?.role ?? null;
    const canAccessGramophone = checkRolePermission(role, "gramophone", "access");

    return routes.redirect(
      request,
      canAccessGramophone ? routes.library.index : routes.settings.index,
    );
  }

  return NextResponse.next();
}