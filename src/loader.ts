/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-shadow */
import type { LoaderDefinition } from 'webpack';
import { NS, PACKAGE_NAME } from './const';

type HackLoaderFunction = (loader: LoaderDefinition, loaderPath: string) => LoaderDefinition;

function hackWrapLoaders(loaderPaths: string[], callback: HackLoaderFunction) {
    const wrapRequire = (requireMethod: NodeRequire) => {
        return function (...args: any[]) {
            // although `require` should only accept one parameter and `this` binding should be undefined, we do want to make less surprise.
            const originExport = requireMethod.apply(this, args);
            // `id` is the input of `require`, like `require(id)`
            const id = args[0];
            const isOriginExportAWebpackLoader = loaderPaths.includes(id);
            if (isOriginExportAWebpackLoader) {
                if (originExport.__smpHacked) return originExport;
                originExport.__smpHacked = true;
                return callback(originExport, id);
            }
            return originExport;
        };
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Module = require('module');
    Module.prototype.require = wrapRequire(Module.prototype.require);
}

let id = 0;

function getLoaderName(path: string) {
    const standardPath = path.replace(/\\/g, '/');
    const nodeModuleName = /\/node_modules\/([^/]+)/.exec(standardPath);
    return (nodeModuleName && nodeModuleName[1]) || '';
}

const loader: LoaderDefinition = function (source) {
    return source;
};

/**
 * Override `require` method, so that we could return a wrapped loader function.
 * 
 * Each time the wrapped function is called, we could do some extra work.
 */
loader.pitch = function (this, q, w, e) {
    const callback = this[NS];
    const module = this.resourcePath;
    const loaderPaths = this.loaders
        .map((l) => l.path)
        .filter((l) => !l.includes(PACKAGE_NAME));

    // Hack ourselves to overwrite the `require` method so we can override the
    // loadLoaders
    hackWrapLoaders(loaderPaths, (loader, path) => {
        const loaderName = getLoaderName(path);
        const wrapLoader = (loaderFunc: LoaderDefinition) =>
            function () {
                const loaderId = id++;
                const almostThis = Object.assign({}, this, {
                    async: () => {
                        const originCallback = this.async();

                        return function () {
                            callback({
                                id: loaderId,
                                type: 'end',
                            });
                            return originCallback(arguments);
                        };
                    },
                });

                callback({
                    module,
                    loaderName,
                    id: loaderId,
                    type: 'start',
                });
                const ret = loaderFunc.apply(almostThis, arguments);
                callback({
                    id: loaderId,
                    type: 'end',
                });
                return ret;
            };

        // @ts-ignore
        if (loader.normal) {
            console.log('In which condition will loader have a "normal" property?');
            // @ts-ignore
            loader.normal = wrapLoader(loader.normal);
        }
        // @ts-ignore
        if (loader.default) {
            console.log('In which condition will loader have a "default" property?');
            // @ts-ignore
            loader.default = wrapLoader(loader.default);
        }
        if (loader.pitch) loader.pitch = wrapLoader(loader.pitch);
        if (typeof loader === 'function') return wrapLoader(loader);
        return loader;
    });
};

module.exports = loader;
