

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface DatabaseErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleDatabaseError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: DatabaseErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
  };

  console.error('MySQL Database Operation Error:', JSON.stringify(errInfo));

  throw new Error(JSON.stringify(errInfo));
}
