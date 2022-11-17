/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/naming-convention */
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import type { AsyncHook, Hook } from 'tapable';
import { isSymbolObject } from 'util/types';
import type { Compiler, WebpackPluginFunction, WebpackPluginInstance } from 'webpack';
import { analyzer, TapType } from './analyzer';
import { WebpackPlugin } from './plugin';
import { assert, fail } from './utils';

const injectedPlugins = new Set<WebpackPluginInstance>();
const injectedPluginNames = new Set<string>();

function validatePluginIsUsedOnce(plugin: WebpackPluginInstance) {
    const pluginName = plugin.constructor.name;
    injectedPlugins.add(plugin);
    injectedPluginNames.add(plugin.constructor.name);
    if (injectedPlugins.size !== injectedPluginNames.size) {
        fail(`${pluginName} is used twice, why?`);
    }
}

type Tap = Hook<any, any>['tap'];
type TapAsync = AsyncHook<any, any>['tapAsync'];
type TapPromise = AsyncHook<any, any>['tapPromise'];

type Q = Parameters<Tap>;
type TapCallback = Parameters<Tap>[1];
type TapAsyncCallback = Parameters<TapAsync>[1];
type TapPromiseCallback = Parameters<TapPromise>[1];

/**
 * How to access currect object from first proxied object
 * For example, in `a.b.c.d`, `b` is the first proxied object, then for d, it's
 */
type PropertyTrackPaths = string[];

export class ProxyPlugin implements WebpackPlugin {
    private _proxiedPlugin: WebpackPlugin;

    proxiedPluginName: string;

    constructor(proxiedPlugin: WebpackPlugin) {
        this._proxiedPlugin = proxiedPlugin;
        this.proxiedPluginName = proxiedPlugin.constructor.name;
    }

    apply(compiler: Compiler): void {
        this._proxyForHookProviderCandidates(compiler);
    }

    private _hookProviderCandidatesClassName = ['Compiler', 'Compilation', 'ContextModuleFactory', 'JavascriptParser', 'NormalModuleFactory'];

    private _isHooksProvider(candidate: any) {
        const className = candidate?.constructor?.name; // not a pretty accurate condition, but it should be enough.
        if (!className) return false;
        return this._hookProviderCandidatesClassName.includes(candidate);
    }

    private cachedProxyForHooksProvider = new Map();

    _proxyForHookProviderCandidates(
        candidate: any, // @types/webpack does not export all the types. Use `any` for now.
    ) {
        if (this._isHooksProvider(candidate)) {
            return candidate;
        }
        return this._proxyForHooksProvider(candidate);
    }

    private _proxyForHooksProvider(
        hooksProvider: any, // @types/webpack does not export all the types. Use `any` for now.
    ) {
        const { _proxyForHooks } = this;
        return getOrCreate(this.cachedProxyForHooksProvider, hooksProvider, __proxyForHooksProviderWorker);

        function __proxyForHooksProviderWorker(hooksProvider: any) {
            return new Proxy(hooksProvider, {
                get: (target, property) => {
                    if (property === 'hooks') {
                        const hooks = target[property];
                        return _proxyForHooks(hooks, [hooksProvider.constructor.name, property]);
                    }
                },
            });
        }
    }

    private cachedProxyForHooks = new Map();

    private _proxyForHooks(hooks: any, propertyTrackPaths: PropertyTrackPaths) {
        const { _proxyForHook } = this;
        return getOrCreate(this.cachedProxyForHooks, hooks, _proxyForHooksWorker);

        function _proxyForHooksWorker(hooks: any) {
            return new Proxy(hooks, {
                get: function (target, property) {
                    assert(!isSymbolObject(property), 'Getting Symbol property from "hooks", it should never happen, right?');
                    const hook = target[property];
                    // TODO: check `hook` inheritage from `Tapable`
                    return _proxyForHook(hook, [...propertyTrackPaths, property]);
                },
            });
        }
    }

    private cachedProxyForHook = new Map();

    private _proxyForHook(hook: any, propertyTrackPaths: PropertyTrackPaths) {
        return getOrCreate(this.cachedProxyForHook, hook, this._proxyForHookWorker);
    }

    private knownTapMethodNames = ['tap', 'tapAsync', 'tapPromise'];

    private _proxyForHookWorker(hook: any) {
        const { knownTapMethodNames, _proxyForTap, _proxyForTapAsync, _proxyForTapPromise } = this;
        return new Proxy(hook, {
            get: function (target, property) {
                assert(!isSymbolObject(property), 'Getting Symbol property from "hook", it should never happen, right?');
                assert(knownTapMethodNames.includes(property));
                const tapMethod = target[property];
                switch (property) {
                    case 'tap':
                        return _proxyForTap(tapMethod);
                    case 'tapAsync':
                        return _proxyForTapAsync(tapMethod);
                    case 'tapPromise':
                        return _proxyForTapPromise(tapMethod);
                    default:
                        fail(`${property} is called on a hook, but we could not handle it now.`);
                }
            },
        });
    }

    private cachedProxyForTap = new Map();

    private cachedProxyForTapAsync = new Map();

    private cachedProxyForTapPromise = new Map();

    private _proxyForTap(tap: Tap) {
        return getOrCreate(this.cachedProxyForTap, tap, this._proxyForTapWorker);
    }

    private _proxyForTapAsync(tap: Tap) {
        return getOrCreate(this.cachedProxyForTapAsync, tap, this._proxyForTapAsyncWorker);
    }

    private _proxyForTapPromise(tap: Tap) {
        return getOrCreate(this.cachedProxyForTapPromise, tap, this._proxyForTapPromiseWorker);
    }

    private _proxyForTapWorker(tap: Tap) {
        return new Proxy(tap, {
            apply: (target, thisArg, argArray) => {
                assert(argArray.length == 2, 'tap should receive only two parameters');
                const options = argArray[0];
                const originFn = argArray[1];
                const wrappedFn = wrapTapCallback.call(this, originFn);
                return target.apply(thisArg, [options, wrappedFn]);
            },
        });
    }

    private _proxyForTapAsyncWorker(tap: TapAsync) {
        return new Proxy(tap, {
            apply: (target, thisArg, argArray) => {
                assert(argArray.length == 2, 'tap should receive only two parameters');
                const options = argArray[0];
                const originFn = argArray[1];
                const wrappedFn = wrapTapAsyncCallback.call(this, originFn);
                return target.apply(thisArg, [options, wrappedFn]);
            },
        });
    }

    private _proxyForTapPromiseWorker(tap: TapPromise) {
        return new Proxy(tap, {
            apply: (target, thisArg, argArray) => {
                assert(argArray.length == 2, 'tap should receive only two parameters');
                const options = argArray[0];
                const originFn = argArray[1];
                const wrappedFn = wrapTapPromiseCallback.call(this, originFn);
                return target.apply(thisArg, [options, wrappedFn]);
            },
        });
    }
}

function wrapTapCallback(this: ProxyPlugin, tapCallback: TapCallback): TapCallback {
    const pluginName = this.proxiedPluginName;
    const proxyForHookProviderCandidates = this._proxyForHookProviderCandidates;
    return function (...args: any[]) {
        args.forEach(proxyForHookProviderCandidates);
        const uuid = randomUUID();
        analyzer.collectInfo({
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.normal,
        });
        const origionalReturn = tapCallback(...args);
        analyzer.collectInfo({
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.normal,
        });
        return origionalReturn;
    };
}

function wrapTapAsyncCallback(this: ProxyPlugin, tapCallback: TapAsyncCallback): TapAsyncCallback {
    const pluginName = this.proxiedPluginName;
    const proxyForHookProviderCandidates = this._proxyForHookProviderCandidates;
    return function (...args: any[]) {
        args.forEach(proxyForHookProviderCandidates);
        const callback = args[args.length - 1];
        const uuid = randomUUID();
        analyzer.collectInfo({
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.async,
        });
        const wrappedCallback = () => {
            analyzer.collectInfo({
                pluginName: '',
                time: performance.now(),
                tapCallId: uuid,
                tapType: TapType.async,
            });
            callback();
        };
        const origionalReturn = tapCallback(...args, wrappedCallback);
        return origionalReturn;
    };
}

function wrapTapPromiseCallback(this: ProxyPlugin, tapCallback: TapPromiseCallback): TapPromiseCallback {
    const pluginName = this.proxiedPluginName;
    const proxyForHookProviderCandidates = this._proxyForHookProviderCandidates;
    return function (...args: any[]) {
        args.forEach(proxyForHookProviderCandidates);
        const uuid = randomUUID();
        analyzer.collectInfo({
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.promise,
        });
        const originPromise = tapCallback(...args);
        originPromise.then(() => {
            analyzer.collectInfo({
                pluginName: '',
                time: performance.now(),
                tapCallId: uuid,
                tapType: TapType.promise,
            });
        });
        return originPromise;
    };
}

function getOrCreateWithContext<K, V>(
    cache: Map<K, { value: V, context: any }>,
    key: K, factory: (k: K) => V,
    contextFactory: any,
) {
    const withContextFactory = (k: K) => ({
        value: factory(k),
        context: contextFactory,
    });
    const withContextObject = getOrCreate(cache, key, withContextFactory);
    return withContextObject.value;
}

function getOrCreate<K, V>(cache: Map<K, V>, key: K, factory: (k: K) => V) {
    if (!cache.has(key)) {
        const proxyForHooks = factory(key);
        cache.set(key, proxyForHooks);
    }
    return cache.get(key)!;
}