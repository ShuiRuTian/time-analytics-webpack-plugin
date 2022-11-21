/* eslint-disable @typescript-eslint/no-this-alias */ // use function, so that we could put logic firstly
/* eslint-disable @typescript-eslint/no-shadow */ // could not come up with that many name
/* eslint-disable @typescript-eslint/naming-convention */ // use _ as private field name
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import type { AsyncHook, Hook } from 'tapable';
import { isSymbolObject } from 'util/types';
import type { Compiler, WebpackPluginFunction, WebpackPluginInstance } from 'webpack';
import { AnalyzeInfoKind, analyzer, PluginEventType, TapType } from './analyzer';
import { WebpackPlugin } from './TimeAnalyticsPlugin';
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
        validatePluginIsUsedOnce(proxiedPlugin);
        this._proxiedPlugin = proxiedPlugin;
        this.proxiedPluginName = proxiedPlugin.constructor.name;
    }

    apply(compiler: Compiler): void {
        const proxiedCompiler = this._proxyForHookProviderCandidates(compiler);
        this._proxiedPlugin.apply(proxiedCompiler);
    }

    private _hookProviderCandidatesClassName = ['Compiler', 'Compilation', 'ContextModuleFactory', 'JavascriptParser', 'NormalModuleFactory'];

    private _isHooksProvider(candidate: any) {
        const className = candidate?.constructor?.name; // not a pretty accurate condition, but it should be enough.
        if (!className) return false;
        return this._hookProviderCandidatesClassName.includes(className);
    }

    private cachedProxyForHooksProvider = new Map();

    _proxyForHookProviderCandidates(
        candidate: any, // @types/webpack does not export all the types. Use `any` for now.
    ) {
        if (!this._isHooksProvider(candidate)) {
            return candidate;
        }
        return this._proxyForHooksProvider(candidate);
    }

    private _proxyForHooksProvider(
        hooksProvider: any, // @types/webpack does not export all the types. Use `any` for now.
    ) {
        const that = this;
        return getOrCreate(this.cachedProxyForHooksProvider, hooksProvider, __proxyForHooksProviderWorker);

        function __proxyForHooksProviderWorker(hooksProvider: any) {
            return new Proxy(hooksProvider, {
                get: (target, property) => {
                    if (property === 'hooks') {
                        const originHooks = target[property];
                        assert(Object.isFrozen(originHooks), 'webpack frozens all `hooks` by defualt');
                        assert(originHooks.constructor.name === 'Object', '`Hooks` should just be plain object');
                        const unfrozenHooks = { ...originHooks };
                        const ret = that._proxyForHooks(unfrozenHooks, [hooksProvider.constructor.name, property]);
                        return ret;
                    }
                },
            });
        }
    }

    private cachedProxyForHooks = new Map();

    private _proxyForHooks(hooks: any, propertyTrackPaths: PropertyTrackPaths) {
        const that = this;
        return getOrCreate(this.cachedProxyForHooks, hooks, _proxyForHooksWorker);

        function _proxyForHooksWorker(hooks: any) {
            return new Proxy(hooks, {
                get: function (target, property) {
                    assert(!isSymbolObject(property), 'Getting Symbol property from "hooks", it should never happen, right?');
                    const hook = target[property];
                    // TODO: check `hook` inheritage from `Tapable`
                    return that._proxyForHook(hook, [...propertyTrackPaths, property]);
                },
            });
        }
    }

    private cachedProxyForHook = new Map();

    private _proxyForHook(hook: any, propertyTrackPaths: PropertyTrackPaths) {
        const that = this;
        return getOrCreate(this.cachedProxyForHook, hook, _proxyForHookWorker);

        function _proxyForHookWorker(hook: any) {
            return new Proxy(hook, {
                get: function (target, property) {
                    // `_tap` is the implement detail that is used internally
                    // handle every thing explicitly to take full control of it
                    if (property === '_tap') return target[property];
                    assert(!isSymbolObject(property), 'Getting Symbol property from "hook", it should never happen, right?');
                    assert(that.knownTapMethodNames.includes(property));
                    const tapMethod = target[property];
                    switch (property) {
                        case 'tap':
                            return that._proxyForTap(tapMethod);
                        case 'tapAsync':
                            return that._proxyForTapAsync(tapMethod);
                        case 'tapPromise':
                            return that._proxyForTapPromise(tapMethod);
                        default:
                            fail(`${property} is called on a hook, but we could not handle it now.`);
                    }
                },
            });
        }
    }

    private knownTapMethodNames = ['tap', 'tapAsync', 'tapPromise'];


    private cachedProxyForTap = new Map();

    private cachedProxyForTapAsync = new Map();

    private cachedProxyForTapPromise = new Map();

    private _proxyForTap(tap: Tap) {
        return getOrCreate(this.cachedProxyForTap, tap, this._proxyForTapWorker.bind(this));
    }

    private _proxyForTapAsync(tap: Tap) {
        return getOrCreate(this.cachedProxyForTapAsync, tap, this._proxyForTapAsyncWorker.bind(this));
    }

    private _proxyForTapPromise(tap: Tap) {
        return getOrCreate(this.cachedProxyForTapPromise, tap, this._proxyForTapPromiseWorker.bind(this));
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
        analyzer.collectPluginInfo({
            kind: AnalyzeInfoKind.plugin,
            eventType: PluginEventType.start,
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.normal,
        });
        const origionalReturn = tapCallback(...args);
        analyzer.collectPluginInfo({
            kind: AnalyzeInfoKind.plugin,
            eventType: PluginEventType.end,
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
        analyzer.collectPluginInfo({
            kind: AnalyzeInfoKind.plugin,
            eventType: PluginEventType.start,
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.async,
        });
        const wrappedCallback = () => {
            analyzer.collectPluginInfo({
                kind: AnalyzeInfoKind.plugin,
                eventType: PluginEventType.end,
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
        analyzer.collectPluginInfo({
            eventType: PluginEventType.start,
            kind: AnalyzeInfoKind.plugin,
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.promise,
        });
        const originPromise = tapCallback(...args);
        originPromise.then(() => {
            analyzer.collectPluginInfo({
                eventType: PluginEventType.end,
                kind: AnalyzeInfoKind.plugin,
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