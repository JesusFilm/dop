export class GatheringError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "GatheringError";
  }
}

export function isGatheringError(error: unknown): error is GatheringError {
  return error instanceof GatheringError;
}
