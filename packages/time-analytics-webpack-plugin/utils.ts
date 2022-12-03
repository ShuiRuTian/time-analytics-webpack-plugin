import { PACKAGE_NAME } from './const';
import { performance } from 'perf_hooks';

/**
 * Add prefix "[time-analytics-webpack-plugin]: " prefix to all meesages
 */
export class ConsoleHelper {
    static log(message: string) {
        console.log(ConsoleHelper.getMessage(message));
    }

    static warn(message: string) {
        console.warn(ConsoleHelper.getMessage(message));
    }

    private static getMessage(message: string) {
        return `[${PACKAGE_NAME}]: ${message}`;
    }
}

/// The whole assert part is basically copied from typescript repo.
export function fail(message?: string): never {
    // const isProduction = true;
    // if (isProduction) return;
    failInDebug(message);
}

export function failInDebug(message?: string): never {
    // eslint-disable-next-line no-debugger
    debugger;
    const e = new Error(message ? `Debug Failure.${message} ` : 'Debug Failure.');
    throw e;
}

export function assert(expression: unknown, message?: string, verboseDebugInfo?: string | (() => string)): asserts expression {
    if (!expression) {
        message = message ? `False expression: ${message} ` : 'False expression.';
        if (verboseDebugInfo) {
            message += '\r\nVerbose Debug Information: ' + (typeof verboseDebugInfo === 'string' ? verboseDebugInfo : verboseDebugInfo());
        }
        fail(message);
    }
}

export function assertIsDefined<T>(value: T, message?: string): asserts value is NonNullable<T> {
    if (value === undefined || value === null) {
        fail(message);
    }
}

export function assertNever(member: never, message = 'Assert never:'): never {
    const detail = JSON.stringify(member);
    return failInDebug(`${message} ${detail} `);
}

export function now() {
    return performance.now();
}

/**
 * like `instanceof `, but not accurate. Judgement by the name of constructor.
 */
// webpack does not export tapable, so there is no way to know whether a class is hook or not easily.
export function isConstructorNameInPrototypeChain(name: string, obj: any) {
    let curPropto = obj;
    while (curPropto) {
        if (curPropto.constructor.name === name) {
            return true;
        }
        curPropto = Reflect.getPrototypeOf(curPropto);
    }
    return false;
}
