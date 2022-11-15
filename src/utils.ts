/// The whole file is basically copied from typescript repo.

export function fail(message?: string): never {
    // const isProduction = true;
    // if (isProduction) return;
    failInDebug(message);
}

export function failInDebug(message?: string): never {
    // eslint-disable-next-line no-debugger
    debugger;
    const e = new Error(message ? `Debug Failure. ${message}` : 'Debug Failure.');
    throw e;
}

export function assert(expression: unknown, message?: string, verboseDebugInfo?: string | (() => string)): asserts expression {
    if (!expression) {
        message = message ? `False expression: ${message}` : 'False expression.';
        if (verboseDebugInfo) {
            message += '\r\nVerbose Debug Information: ' + (typeof verboseDebugInfo === 'string' ? verboseDebugInfo : verboseDebugInfo());
        }
        fail(message);
    }
}

export function assertIsDefined<T>(value: T, message?: string): asserts value is NonNullable<T> {
    // eslint-disable-next-line no-null/no-null
    if (value === undefined || value === null) {
        fail(message);
    }
}

export function assertNever(member: never, message = 'Assert never:'): never {
    const detail = JSON.stringify(member);
    return failInDebug(`${message} ${detail}`);
}
