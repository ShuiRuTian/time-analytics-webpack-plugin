import { expect } from 'chai';
import path from 'path';
import { getLoaderName } from 'time-analytics-webpack-plugin/loaderHelper';

const NODE_MODULES_PATH = 'node_modules';

const canonicalPath = (pathS: string) => pathS.replace(/\\/g, '/');

describe('getLoaderName function', () => {
    describe('when the path does not include "node_modules"', () => {
        it('should return the whole path', () => {
            const testPath = canonicalPath(path.join('a', 'b', 'c'));
            const loaderName = getLoaderName(testPath);
            expect(loaderName).to.be.string(testPath);
        });
    });

    describe('when the path includes "node_modules"', () => {
        it('should return the next path afther the last "node_modules"', () => {
            const nextPathAfterLastNodeModules = 'loaderPackageName';
            const testPath = canonicalPath(path.join('root', NODE_MODULES_PATH, 'c', 'd', NODE_MODULES_PATH, nextPathAfterLastNodeModules, 'f'));
            const loaderName = getLoaderName(testPath);
            expect(loaderName).to.be.string(nextPathAfterLastNodeModules);
        });

        it('should return one more path if the name includes "@"', () => {
            const nextPathAfterLastNodeModules = canonicalPath(path.join('@foo', 'loaderPackageName'));
            const testPath = canonicalPath(path.join('root', NODE_MODULES_PATH, 'c', 'd', NODE_MODULES_PATH, nextPathAfterLastNodeModules, 'f'));
            const loaderName = getLoaderName(testPath);
            expect(loaderName).to.be.string(nextPathAfterLastNodeModules);
        });
    });
});