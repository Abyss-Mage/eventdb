import { NextResponse } from "next/server";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: string;
};

function normalizeInit(init?: number | ResponseInit): ResponseInit {
  if (typeof init === "number") {
    return { status: init };
  }

  return init ?? {};
}

export function success<T>(
  data: T,
  init?: number | ResponseInit,
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json<ApiSuccess<T>>({ success: true, data }, normalizeInit(init));
}

export function failure(
  error: string,
  init?: number | ResponseInit,
): NextResponse<ApiFailure> {
  return NextResponse.json<ApiFailure>(
    { success: false, error },
    normalizeInit(init),
  );
}

export function getErrorMessage(
  error: unknown,
  fallback = "Unexpected server error.",
): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}
