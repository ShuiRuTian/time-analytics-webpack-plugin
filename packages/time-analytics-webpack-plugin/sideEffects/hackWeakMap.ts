import { randomUUID } from 'crypto';
import { WEBPACK_WEAK_MAP_ID_KEY } from '../const';
import { assert } from '../utils';

/**
 * The object which will be used as the key of WeakMap for compilation/compiler.
 * 
 * Need this, because WeakMap only accepts key as object.
 */
class WebpackWeakMapId {
    private id = randomUUID();
}

assert(WeakMap, 'WeakMap must be existed.');

const originSet = WeakMap.prototype.set;
const originGet = WeakMap.prototype.get;

/**
 * Whether one object is `Compiler` in webpack
 */
function isCompiler(obj: any) {
    return obj?.constructor?.name === 'Compiler';
}

/**
 * Whether one object is `Compilation` in webpack
 */
function isCompilation(obj: any) {
    return obj?.constructor?.name === 'Compilation';
}

function GetOrAddHackKeyFor(key: any) {
    let finalKey = key;

    // The reference of Proxy and its target is different
    // Then `NormalModule.getCompilationHooks(compilation).loader` might get wrong hook
    // Hack the WeakMap, so that we could generate a unique ID for each  to generate a unique  
    if (isCompiler(key) || isCompilation(key)) {
        if (!key[WEBPACK_WEAK_MAP_ID_KEY]) {
            (key as any)[WEBPACK_WEAK_MAP_ID_KEY] = new WebpackWeakMapId();
        }
        finalKey = key[WEBPACK_WEAK_MAP_ID_KEY];
    }

    return finalKey;
}

WeakMap.prototype.set = function setHack(this, key, value) {
    const finalKey = GetOrAddHackKeyFor(key);
    return originSet.call(this, finalKey, value);
};

WeakMap.prototype.get = function setHack(this, key) {
    const finalKey = GetOrAddHackKeyFor(key);
    return originGet.call(this, finalKey);
};
