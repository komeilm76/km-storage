import _ from "lodash";
import {
  AnyZodObject,
  z,
  ZodBoolean,
  ZodNaN,
  ZodNull,
  ZodNullable,
  ZodNumber,
  ZodOptional,
  ZodString,
  ZodType,
  ZodUndefined,
} from "zod";

type IInputValue = string | Object | boolean | number;

const isObject = (value: IInputValue) => {
  return _.isObject(value);
};

const isJson = (value: any) => {
  let output: boolean = false;
  if (typeof value == "string") {
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
  if (schema instanceof ZodNumber) {
    return _.toNumber(value);
  } else if (schema instanceof ZodNull) {
    return null;
  } else if (schema instanceof ZodNaN) {
    return NaN;
  } else if (schema instanceof ZodString) {
    return _.toString(value);
  } else if (schema instanceof ZodBoolean) {
    if (value == "false") {
      return false;
    } else {
      return true;
    }
  } else if (schema instanceof ZodNullable) {
    return transformToRealType(schema._def.innerType, value);
  } else if (schema instanceof ZodOptional) {
    return transformToRealType(schema._def.innerType, value);
  } else {
    return value;
  }
};

const install = <SCHEMA extends AnyZodObject, NAME extends string>(schema: SCHEMA, name: NAME) => {
  const prefix: NAME = name;
  const spliter = ":" as const;
  const recordId = `${prefix}${spliter}` as const;

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
    let output = _recordId.replace(recordId, "") as KEY;
    return output;
  };

  const make = <STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>, KEY extends keyof STORAGE = keyof STORAGE>(
    value: STORAGE[KEY]
  ) => {
    let outputValue: STORAGE[KEY];
    let isObjectValue = isObject(value as IInputValue);

    if (isObjectValue) {
      outputValue = JSON.stringify(value) as STORAGE[KEY];
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
    let value = localStorage.getItem(recordId);

    if (isJson(value as IInputValue)) {
      if (value !== null) {
        return JSON.parse(value) as STORAGE[KEY];
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
      throw `Your Entry | name:'${name as string}' | is not Valid. Please Use Valid Name Or Update Schema`;
    }
  };
  const create = <STORAGE extends z.infer<SCHEMA>, KEY extends keyof STORAGE = keyof STORAGE>(
    name: KEY,
    value: STORAGE[KEY]
  ) => {
    let isValid = validEntry(name, value);
    if (isValid) {
      let recordId = getRecordIdByName<STORAGE>(name);
      let makedValue = make(value);
      localStorage.setItem(recordId as string, makedValue);
    }
  };

  const use = <STORAGE extends z.infer<SCHEMA> = z.infer<SCHEMA>, KEY extends keyof STORAGE = keyof STORAGE>(
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
    localStorage.removeItem(recordId as string);
  };

  return {
    create,
    use,
    useAll,
    remove,
  };
};

export default {
  install,
};
