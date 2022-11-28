import { WEBPACK_WEAK_MAP_ID_KEY } from '../const';
import { assert } from '../utils';
import { WebpackWeakMapId } from './WeakMapIdObject';

assert(WeakMap, 'WeakMap must be existed.');

const originSet = WeakMap.prototype.set;
const originGet = WeakMap.prototype.get;

function tryGetKeyForCompilation(key: any) {
    let finalKey = key;
    // The reference of Proxy and its target is different
    // Then `NormalModule.getCompilationHooks(compilation).loader` might get wrong hook
    // Hack the WeakMap, so that we could generate a unique ID for each  to generate a unique  
    const compilationId: any = key[WEBPACK_WEAK_MAP_ID_KEY];
    const isWebpackCompilation = !!compilationId;
    if (isWebpackCompilation) {
        assert(compilationId instanceof WebpackWeakMapId);
        finalKey = compilationId;
    }
    return finalKey;
}

WeakMap.prototype.set = function setHack(this, key, value) {
    const finalKey = tryGetKeyForCompilation(key);
    return originSet.call(this, finalKey, value);
};

WeakMap.prototype.get = function setHack(this, key) {
    const finalKey = tryGetKeyForCompilation(key);
    return originGet.call(this, finalKey);
};
