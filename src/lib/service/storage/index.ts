import _ from 'lodash';
import { parse, stringify } from 'zipson/lib';
import {
  AnyZodObject,
  z,
  ZodBoolean,
  ZodDefault,
  ZodNaN,
  ZodNull,
  ZodNullable,
  ZodNumber,
  ZodOptional,
  ZodString,
  ZodType,
  ZodUndefined,
} from 'zod';

type IInputValue = string | Object | boolean | number;

const isObject = (value: IInputValue) => {
  return _.isObject(value);
};

const isJson = (value: any) => {
  let output: boolean = false;
  if (typeof value == 'string') {
    try {
      let parsed = JSON.parse(value);
      if (isObject(parsed)) {
        output = true;
      } else {
        output = false;
      }
    } catch (error) {
      output = false;
    }
  } else {
    output = false;
  }
  return output;
};

const transformToRealType = <SCHEMA extends ZodType>(schema: SCHEMA, value: any) => {
  let output = value;
  if (schema instanceof ZodNumber) {
    output = _.toNumber(output);
  } else if (schema instanceof ZodUndefined) {
    output = undefined;
  } else if (schema instanceof ZodNull) {
    output = null;
  } else if (schema instanceof ZodNaN) {
    output = NaN;
  } else if (schema instanceof ZodString) {
    output = _.toString(value);
  } else if (schema instanceof ZodBoolean) {
    if (value == 'false') {
      output = false;
    } else {
      output = true;
    }
  } else if (schema instanceof ZodNullable) {
    output = transformToRealType(schema._def.innerType, value);
  } else if (schema instanceof ZodOptional) {
    output = transformToRealType(schema._def.innerType, value);
  } else if (schema instanceof ZodDefault) {
    output = transformToRealType(schema._def.innerType, value);
  } else {
    output = value;
  }

  return output;
};

type IOptions<NAME> = {
  prefix: NAME;
  mode: 'localStorage' | 'sessionStorage';
  editManualy: boolean;
  compress: boolean;
};

const install = <SCHEMA extends AnyZodObject, NAME extends string>(
  schema: SCHEMA,
  options: Partial<IOptions<NAME>>
) => {
  const defaultOptions: IOptions<NAME> = {
    mode: 'localStorage',
    prefix: 'km' as NAME,
    editManualy: true,
    compress: false,
    ...options,
  };
  let defaultStorage = defaultOptions.mode == 'localStorage' ? localStorage : sessionStorage;
  const prefix: NAME = defaultOptions.prefix;
  const spliter = ':' as const;
  const recordId = `${prefix}${spliter}` as const;

  let state: 'manualy' | 'systematic' | 'none' = 'none';

  const getRecordIdByName = <
    STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>,
    KEY extends keyof STORAGE = keyof STORAGE
  >(
    name: KEY
  ) => {
    // @ts-ignore
    let output: `${typeof recordId}${KEY}` = `${prefix}:${name}`;
    return output;
  };

  const getRecordNameById = <
    STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>,
    KEY extends keyof STORAGE = keyof STORAGE
  >(
    // @ts-ignore
    _recordId: `${typeof recordId}${KEY}`
  ) => {
    // @ts-ignore
    let output = _recordId.replace(recordId, '') as KEY;
    return output;
  };

  const make = <
    STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>,
    KEY extends keyof STORAGE = keyof STORAGE
  >(
    value: STORAGE[KEY]
  ) => {
    let outputValue: STORAGE[KEY];
    let isObjectValue = isObject(value as IInputValue);

    if (isObjectValue) {
      outputValue = options.compress
        ? (stringify(value) as STORAGE[KEY])
        : (JSON.stringify(value) as STORAGE[KEY]);
    } else {
      outputValue = value as STORAGE[KEY];
    }

    return outputValue;
  };

  const read = <
    STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>,
    KEY extends keyof STORAGE = keyof STORAGE,
    // @ts-ignore
    RECORDID extends `${typeof recordId}${KEY}` = `${typeof recordId}${KEY}`
  >(
    recordId: RECORDID
  ) => {
    let name = getRecordNameById<STORAGE>(recordId);
    let value = defaultStorage.getItem(recordId);

    if (isJson(value as IInputValue)) {
      if (value !== null) {
        return options.compress
          ? (parse(value) as STORAGE[KEY])
          : (JSON.parse(value) as STORAGE[KEY]);
      } else {
        return undefined;
      }
    } else {
      let realValue = transformToRealType(schema.shape[name], value);
      if (value !== null) {
        return realValue as STORAGE[KEY];
      } else {
        return undefined;
      }
    }
  };

  const validEntry = <STORAGE extends z.infer<SCHEMA>, KEY extends keyof STORAGE = keyof STORAGE>(
    name: KEY,
    value: STORAGE[KEY]
  ) => {
    name;
    value;
    let keys = Object.keys(schema.shape) as KEY[];
    if (keys.includes(name)) {
      let keySchema = schema.shape[name] as ZodType;
      let parsedValue = keySchema.safeParse(value);
      if (parsedValue.success == false) {
        throw parsedValue.error.issues;
      } else {
        return true;
      }
    } else {
      throw `Your Entry | name:'${
        name as string
      }' | is not Valid. Please Use Valid Name Or Update Schema`;
    }
  };
  const create = <STORAGE extends z.infer<SCHEMA>, KEY extends keyof STORAGE = keyof STORAGE>(
    name: KEY,
    value: STORAGE[KEY]
  ) => {
    let isValid = validEntry(name, value);
    if (isValid) {
      state = 'systematic';
      let recordId = getRecordIdByName<STORAGE>(name);
      let makedValue = make(value);
      defaultStorage.setItem(recordId as string, makedValue);
    }
    setTimeout(() => {
      state = 'none';
    }, 10);
  };

  const use = <
    STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>,
    KEY extends keyof STORAGE = keyof STORAGE
  >(
    name: KEY
  ) => {
    let recordId = getRecordIdByName<STORAGE>(name);
    // @ts-ignore
    let value: STORAGE[KEY] | undefined = read(recordId);
    return value;
  };

  const useAll = <
    STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>
    // KEY extends keyof STORAGE = keyof STORAGE
  >() => {
    let output: Partial<STORAGE> = {};
    for (const _key in schema.shape) {
      let key = _key as keyof STORAGE;
      let recordId = getRecordIdByName<STORAGE>(_key);
      let value = read<STORAGE>(recordId);
      output[key] = value;
    }
    return output;
  };

  const remove = <STORAGE extends z.infer<SCHEMA>, KEY extends keyof STORAGE>(name: KEY) => {
    let recordId = getRecordIdByName<STORAGE>(name);
    defaultStorage.removeItem(recordId as string);
  };

  const removeAll = <STORAGE extends z.infer<SCHEMA>, KEY extends keyof STORAGE>() => {
    for (const _key in schema.shape) {
      if (Object.prototype.hasOwnProperty.call(schema.shape, _key)) {
        const key = _key as KEY;
        remove(key);
      }
    }
  };

  const stopChangeManualy = <
    STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>,
    KEY extends keyof STORAGE = keyof STORAGE
  >() => {
    window.addEventListener(
      'storage',
      ($e: StorageEvent) => {
        console.log('$e', $e, state);
        if (state == 'systematic') {
        } else if (state == 'none') {
          state = 'manualy';
          // @ts-ignore
          let key = $e.key as `${typeof recordId}${KEY}`;
          let name = getRecordNameById(key);
          if (schema.shape[name]) {
            let value = $e.oldValue as STORAGE[KEY];
            localStorage.setItem(key, value);
          }
          setTimeout(() => {
            state = 'none';
          }, 10);
        }
      },
      false
    );
  };
  if (options.editManualy == false) {
    stopChangeManualy();
  }

  return {
    create,
    use,
    useAll,
    remove,
    removeAll,
  };
};

export default {
  install,
};

// type IStorageEvent<KEY, VALUE> = {
//   key: KEY;
//   newValue: VALUE;
//   oldValue: VALUE;
// } & {
//   [key: string]: any;
// };
