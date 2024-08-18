import { AnyZodObject, z } from "zod";
type IOptions<NAME> = {
    prefix: NAME;
    mode: "localStorage" | "sessionStorage";
};
declare const _default: {
    install: <SCHEMA extends AnyZodObject, NAME extends string>(schema: SCHEMA, options: Partial<IOptions<NAME>>) => {
        create: <STORAGE extends z.infer<SCHEMA>, KEY extends keyof STORAGE = keyof STORAGE>(name: KEY, value: STORAGE[KEY]) => void;
        use: <STORAGE extends z.infer<SCHEMA> = z.TypeOf<SCHEMA>, KEY_1 extends keyof STORAGE = keyof STORAGE>(name: KEY_1) => STORAGE[KEY_1] | undefined;
        useAll: <STORAGE extends z.infer<SCHEMA> = z.TypeOf<SCHEMA>>() => Partial<STORAGE>;
        remove: <STORAGE extends z.infer<SCHEMA>, KEY_2 extends keyof STORAGE>(name: KEY_2) => void;
    };
};
export default _default;
