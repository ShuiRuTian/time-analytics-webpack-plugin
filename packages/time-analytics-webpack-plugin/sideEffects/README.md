Why Hack "WeakMap"?

```js

class Foo{}

const o = new Foo();
const p = new Proxy(o,{});

o !== p; // the reference is different.

const weakMap = new WeakMap();

class Subtle{
    static factory(a){
        if(weakMap.has(a)){
            return weakMap.get(a);
        }
        const newSubtle = new Subtle();
        weakMap.set(newSubtle);
        return newSubtle;
    }
}
Subtle(o) === Subtle(o); // true
Subtle(p) !== Subtle(o); // true
```

Sadly, we have to use Proxy to take over some functions of other plugins. And `factory` is something webpack is using.

So we have to hack `WeakMap` to make `p` and `o` seems to have the same reference.