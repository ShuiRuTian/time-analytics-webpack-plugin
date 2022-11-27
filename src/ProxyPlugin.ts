/* eslint-disable @typescript-eslint/no-this-alias */ // use function, so that we could put logic firstly
/* eslint-disable @typescript-eslint/no-shadow */ // could not come up with that many name
/* eslint-disable @typescript-eslint/naming-convention */ // use _ as private field name
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import type { AsyncHook, Hook, HookMap } from 'tapable';
import { isSymbolObject } from 'util/types';
import type { Compiler, WebpackPluginInstance } from 'webpack';
import { AnalyzeInfoKind, analyzer, PluginEventType, TapType } from './analyzer';
import { isWebpackPlugin, WebpackPlugin, WebpackPluginLikeFunction } from './TimeAnalyticsPlugin';
import { assert, ConsoleHelper, fail, isConstructorNameInPrototypeChain } from './utils';

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
    private _proxiedPlugin: WebpackPlugin | WebpackPluginLikeFunction;

    proxiedPluginName: string;

    injectedPluginNames = new Set<string>();

    private validatePluginIsUsedOnce(plugin: WebpackPluginInstance) {
        const pluginName = plugin.constructor.name;
        if (this.injectedPluginNames.has(pluginName)) {
            ConsoleHelper.warn(`${pluginName} is used twice, are you sure you really want to do this?`);
        } else {
            this.injectedPluginNames.add(pluginName);
        }
    }


    constructor(proxiedPlugin: WebpackPlugin | WebpackPluginLikeFunction) {
        this.validatePluginIsUsedOnce(proxiedPlugin);
        this._proxiedPlugin = proxiedPlugin;
        this.proxiedPluginName = proxiedPlugin.constructor.name;
    }

    apply(compiler: Compiler): void {
        const proxiedCompiler = this._proxyForHookProviderCandidates(compiler);
        if (isWebpackPlugin(this._proxiedPlugin)) {
            // @ts-ignore, here is tricky, TS could not distinguish apply intertaged from Object and a function called apply 
            // Here is WebpackPlugin instance
            this._proxiedPlugin.apply(proxiedCompiler);
        } else {
            // @ts-ignore, here is tricky, TS could not distinguish apply intertaged from Object and a function called apply 
            // Here is function
            this._proxiedPlugin.apply(proxiedCompiler, proxiedCompiler);
        }
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
                        return that._proxyForHooks(unfrozenHooks, [hooksProvider.constructor.name, property]);
                    }
                    return target[property];
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
                    const method = target[property];
                    switch (true) {
                        case isHook(method):
                            return that._proxyForHook(method, [...propertyTrackPaths, property]);
                        case isFakeHook(method): {
                            assert(Object.isFrozen(method), 'fake hook should be frozen');
                            const unfrozenFakeHook = { ...method };
                            return that._proxyForHook(unfrozenFakeHook, [...propertyTrackPaths, property]);
                        }
                        case isHookMap(method):
                            return that._proxyForHookMap(method);
                        default:
                            fail('unhandled property from hook');
                    }
                },
            });
        }
    }

    private cachedProxyForHookMap = new Map();

    private _proxyForHookMap(hookMap: HookMap<any>) {
        const that = this;
        return getOrCreate(this.cachedProxyForHookMap, hookMap, _proxyForHookMapWorker);

        function _proxyForHookMapWorker(hookMap: HookMap<any>): any {
            return new Proxy(hookMap, {
                get: function (target, property) {
                    const origin = (target as any)[property];
                    if (property === 'for') {
                        return that._proxyForHookMapFor(origin);
                    }
                    return origin;
                },
            });
        }
    }

    private cachedProxyForHookMapFor = new Map();

    private _proxyForHookMapFor(hookMapFor: HookMap<any>['for']) {
        const that = this;
        return getOrCreate(this.cachedProxyForHookMapFor, hookMapFor, _proxyForHookMapForWorker);

        function _proxyForHookMapForWorker(hookMapFor: HookMap<any>['for']) {
            return new Proxy(hookMapFor, {
                apply: (target, thisArg, argArray) => {
                    const originHook = (target as any).apply(thisArg, argArray);
                    assert(isHook(originHook));
                    return that._proxyForHook(originHook, []); // FIXME: use the real call path rather than the array
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
                    assert(!isSymbolObject(property), 'Getting Symbol property from "hook", it should never happen, right?');
                    if (isIgnoreProperty(target, property)) return target[property];
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

        function isIgnoreProperty(target: any, property: string) {
            // `_XXX` is the implement detail that is used internally
            // it might be a bad idea, but we want to handle every thing explicitly to take full control of it
            const isImplementationDetail = property.startsWith('_');
            // if the property is not a function, we do not want to take over it.
            const isFunction = typeof target[property] === 'function';
            // call, callAsync, isUsed and compilte might be used by childCompiler
            const isIgnoredProperty = ['intercept', 'call', 'callAsync', 'isUsed', 'compile'].includes(property);
            return isImplementationDetail || !isFunction || isIgnoredProperty;
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
                assert(argArray.length == 2, 'tapAsync should receive only two parameters');
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
                assert(argArray.length == 2, 'tapPromise should receive only two parameters');
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
    const proxyForHookProviderCandidates = this._proxyForHookProviderCandidates.bind(this);
    return function (...args: any[]) {
        const wrapedArgs = args.map(proxyForHookProviderCandidates);
        const uuid = randomUUID();
        analyzer.collectPluginInfo({
            kind: AnalyzeInfoKind.plugin,
            eventType: PluginEventType.start,
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.normal,
        });
        const origionalReturn = tapCallback(...wrapedArgs);
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
    const proxyForHookProviderCandidates = this._proxyForHookProviderCandidates.bind(this);
    return function (...args: any[]) {
        const callback = args[args.length - 1];
        const noncallbackArgs = args.slice(0, -1);
        const wrapedNoncallbackArgs = noncallbackArgs.map(proxyForHookProviderCandidates);
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
                pluginName,
                time: performance.now(),
                tapCallId: uuid,
                tapType: TapType.async,
            });
            callback();
        };
        const origionalReturn = tapCallback(...wrapedNoncallbackArgs, wrappedCallback);
        return origionalReturn;
    };
}

function wrapTapPromiseCallback(this: ProxyPlugin, tapCallback: TapPromiseCallback): TapPromiseCallback {
    const pluginName = this.proxiedPluginName;
    const proxyForHookProviderCandidates = this._proxyForHookProviderCandidates.bind(this);
    return function (...args: any[]) {
        const wrapedArgs = args.map(proxyForHookProviderCandidates);
        const uuid = randomUUID();
        analyzer.collectPluginInfo({
            eventType: PluginEventType.start,
            kind: AnalyzeInfoKind.plugin,
            pluginName,
            time: performance.now(),
            tapCallId: uuid,
            tapType: TapType.promise,
        });
        const originPromise = tapCallback(...wrapedArgs);
        const ret = originPromise.then(() => {
            analyzer.collectPluginInfo({
                eventType: PluginEventType.end,
                kind: AnalyzeInfoKind.plugin,
                pluginName,
                time: performance.now(),
                tapCallId: uuid,
                tapType: TapType.promise,
            });
        });
        return ret;
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

function isHook(obj: any) {
    return isConstructorNameInPrototypeChain('Hook', obj);
}

/**
 * This is a webpack implementation detail.
 * 
 * Some hook will be removed in webpack 6, and they are not `Tapable` class but a fake hook.
 * 
 * An example hook is `additionalAssets`
 * 
 * @deprecated should be removed if webpack does not use fake hook internally 
 */
function isFakeHook(obj: any) {
    return obj._fakeHook;
}

function isHookMap(obj: any) {
    return isConstructorNameInPrototypeChain('HookMap', obj);
}
