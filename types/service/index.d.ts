declare const _default: {
    storage: {
        install: <SCHEMA extends import("zod").AnyZodObject, NAME extends string>(schema: SCHEMA, options?: {
            prefix: NAME;
        }) => {
            create: <STORAGE extends import("zod").TypeOf<SCHEMA>, KEY extends keyof STORAGE = keyof STORAGE>(name: KEY, value: STORAGE[KEY]) => void;
            use: <STORAGE extends import("zod").TypeOf<SCHEMA> = import("zod").TypeOf<SCHEMA>, KEY_1 extends keyof STORAGE = keyof STORAGE>(name: KEY_1) => STORAGE[KEY_1] | undefined;
            useAll: <STORAGE extends import("zod").TypeOf<SCHEMA> = import("zod").TypeOf<SCHEMA>>() => Partial<STORAGE>;
            remove: <STORAGE extends import("zod").TypeOf<SCHEMA>, KEY_2 extends keyof STORAGE>(name: KEY_2) => void;
        };
    };
};
export default _default;
