import { randomUUID } from 'crypto';

/**
 * The object which will be used as the key of WeakMap for compilation/compiler.
 * 
 * Need this, because WeakMap only accepts key as object.
 */
export class WebpackWeakMapId {
    private id = randomUUID();
}