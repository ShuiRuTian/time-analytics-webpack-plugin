/* eslint-disable @typescript-eslint/no-shadow */
import type { LoaderDefinition } from 'webpack';
import path from 'path';
import fs from 'fs';
import { NS, PACKAGE_NAME } from './const';

type HackLoaderFunction = (loader: LoaderDefinition, loaderPath: string) => any;

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
    const Module = require('module');
    Module.prototype.require = wrapRequire(Module.prototype.require);
}

let id = 0;

function getLoaderName(path: string) {
    const standardPath = path.replace(/\\/g, '/');
    const nodeModuleName = /\/node_modules\/([^/]+)/.exec(standardPath);
    return (nodeModuleName && nodeModuleName[1]) || '';
}

const loader: LoaderDefinition = function () { };
loader.pitch = function (this, q, w, e) {
    if (this.data === e) {
        console.log('Context.data is the third parameter of pitch!');
    } else {
        console.log('Context.data is not the third parameter of pitch!');

    }
    const callback = this[NS];
    const module = this.resourcePath;
    const loaderPaths = this.loaders
        .map((l) => l.path)
        .filter((l) => !l.includes(PACKAGE_NAME));

    // Hack ourselves to overwrite the `require` method so we can override the
    // loadLoaders
    hackWrapLoaders(loaderPaths, (loader, path) => {
        const loaderName = getLoaderName(path);
        const wrapFunc = (func) =>
            function () {
                const loaderId = id++;
                const almostThis = Object.assign({}, this, {
                    async: function () {
                        const asyncCallback = this.async.apply(this, arguments);

                        return function () {
                            callback({
                                id: loaderId,
                                type: 'end',
                            });
                            return asyncCallback.apply(this, arguments);
                        };
                    }.bind(this),
                });

                callback({
                    module,
                    loaderName,
                    id: loaderId,
                    type: 'start',
                });
                const ret = func.apply(almostThis, arguments);
                callback({
                    id: loaderId,
                    type: 'end',
                });
                return ret;
            };

        if (loader.normal) loader.normal = wrapFunc(loader.normal);
        if (loader.default) loader.default = wrapFunc(loader.default);
        if (loader.pitch) loader.pitch = wrapFunc(loader.pitch);
        if (typeof loader === 'function') return wrapFunc(loader);
        return loader;
    });
};

export default loader;