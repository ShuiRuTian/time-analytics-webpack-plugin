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

export function assertEqual<T>(a: T, b: T, msg?: string, msg2?: string): void {
    if (a !== b) {
        const message = msg ? msg2 ? `${msg} ${msg2}` : msg : '';
        fail(`Expected ${a} === ${b}. ${message}`);
    }
}

export function assertLessThan(a: number, b: number, msg?: string): void {
    if (a >= b) {
        fail(`Expected ${a} < ${b}. ${msg || ''}`);
    }
}

export function assertLessThanOrEqual(a: number, b: number): void {
    if (a > b) {
        fail(`Expected ${a} <= ${b}`);
    }
}

export function assertGreaterThanOrEqual(a: number, b: number): void {
    if (a < b) {
        fail(`Expected ${a} >= ${b}`);
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
