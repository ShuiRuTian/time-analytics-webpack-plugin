/* eslint-disable @typescript-eslint/naming-convention */
import { performance } from 'perf_hooks';
import { AsyncHook, Hook } from 'tapable';
import { isSymbolObject } from 'util/types';
import { Compiler, WebpackPluginFunction, WebpackPluginInstance } from 'webpack';
import { analyzer } from './analyzer';
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

type TapCallback = Parameters<Tap>[1];
type TapAsyncCallback = Parameters<TapAsync>[1];
type TapPromiseCallback = Parameters<TapPromise>[1];

/**
 * How to access currect object from first proxied object
 * For example, in `a.b.c.d`, `b` is the first proxied object, then for d, it's
 */
type PropertyTrackPaths = string[];

export class ProxyPlugin implements WebpackPlugin {
    constructor() { }

    apply(compiler: Compiler): void {
        throw new Error('Method not implemented.');
    }

    private _proxyForCompiler(compiler: Compiler) {
        return new Proxy(compiler, {
            get: (target, property) => {
                if (property === 'hooks') {
                    const hooks = target[property];
                    return this._proxyForHooks(hooks);
                }
            },
        });
    }

    private cachedProxyForHooks = new Map();


    private _proxyForHooks(hooks: any, propertyTrackPaths: PropertyTrackPaths) {
        return getOrCreate(this.cachedProxyForHooks, hooks, this._proxyForHooksWorker);
    }

    private _proxyForHooksWorker(hooks: any) {
        const { _proxyForHook } = this;
        return new Proxy(hooks, {
            get: function (target, property) {
                // TODO: check inheritage from `Tapable`
                assert(!isSymbolObject(property), 'Getting Symbol property from "hooks", it should never happen, right?');
                const hook = target[property];
                return _proxyForHook(hook, property);
            },
        });
    }

    private cachedProxyForHook = new Map();

    private _proxyForHook(hook: any, hookName: string) {
        return getOrCreate(this.cachedProxyForHook, hook, this._proxyForHookWorker);
    }

    private knownTapMethodNames = ['tap', 'tapAsync', 'tapPromise'];

    private _proxyForHookWorker(hook: any) {
        const { knownTapMethodNames } = this;
        return new Proxy(hook, {
            get: function (target, property) {
                assert(!isSymbolObject(property), 'Getting Symbol property from "hook", it should never happen, right?');
                assert(knownTapMethodNames.includes(property));
                const tapMethod = target[property];
                // Do the really work!
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
        return getOrCreate(this.cachedProxyForTap, tap, this._proxyForTapAsyncWorker);
    }

    private _proxyForTapPromise(tap: Tap) {
        return getOrCreate(this.cachedProxyForTap, tap, this._proxyForTapPromiseWorker);
    }

    private _proxyForTapWorker(tap: Tap) {
        return new Proxy(tap, {
            apply: function (target, thisArg, argArray) {
                assert(argArray.length == 2, 'tap receives more than two parameters');
                const options = argArray[0];
                const originFn = argArray[1];
                const wrappedFn = wrapTapCallback(originFn);
                return target.apply(thisArg, [options, wrappedFn]);
            },
        });
    }

    private _proxyForTapAsyncWorker(tap: TapAsync) {
        return new Proxy(tap, {
            apply: function (target, thisArg, argArray) {
                assert(argArray.length == 2, 'tap receives more than two parameters');
                const options = argArray[0];
                const originFn = argArray[1];
                const wrappedFn = wrapTapAsyncCallback(originFn);
                return target.apply(thisArg, [options, wrappedFn]);
            },
        });
    }

    private _proxyForTapPromiseWorker(tap: TapPromise) {
        return new Proxy(tap, {
            apply: function (target, thisArg, argArray) {
                assert(argArray.length == 2, 'tap receives more than two parameters');
                const options = argArray[0];
                const originFn = argArray[1];
                const wrappedFn = wrapTapPromiseCallback(originFn);
                return target.apply(thisArg, [options, wrappedFn]);
            },
        });
    }
}

function wrapTapCallback(tapCallback: TapCallback): TapCallback {
    return function (...args) {
        analyzer.collectInfo({
            pluginName: '',

            time: performance.now(),
        });
        const origionalReturn = tapCallback(...args);
        analyzer.collectInfo({
            pluginName: '',
            time: performance.now(),
        });
        return origionalReturn;
    }
}

function wrapTapAsyncCallback(tapCallback: TapAsyncCallback): TapAsyncCallback {

}

function wrapTapPromiseCallback(tapCallback: TapPromiseCallback): TapPromiseCallback {

}

function getOrCreateWithContext<K, V>(
    cache: Map<K, { value: V, context: any }>,
    key: K, factory: (k: K) => V,
    contextFactory: any) {
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

// create one proxy for each plugin
export function proxyForPlugin(plugin: WebpackPluginInstance) {
    validatePluginIsUsedOnce(plugin);
    return new ProxyPlugin();
}
