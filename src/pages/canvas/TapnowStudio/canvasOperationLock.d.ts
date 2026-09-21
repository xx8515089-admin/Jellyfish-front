export function withCanvasOperationLock<T>(key: string, work: () => Promise<T>): Promise<T>
