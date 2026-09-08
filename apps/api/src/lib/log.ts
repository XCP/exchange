type LogFields = Record<string, unknown>;

function serialize(event: string, fields: LogFields): string {
  return JSON.stringify({ event, ...fields }, (_key, value) => {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    return value;
  });
}

export function logInfo(event: string, fields: LogFields = {}): void {
  console.log(serialize(event, fields));
}

export function logError(event: string, fields: LogFields = {}): void {
  console.error(serialize(event, fields));
}
