import _ from "lodash";

type IStorages = {
  token: string;
  theme: {
    dark: boolean;
  };
};

type IInputValue = string | Object | boolean | number;
export class StorageService {
  constructor() {}
  prefix = "pcc-storage" as const;
  spliter = ":" as const;
  // @ts-ignore
  recordId = `${this.prefix}${this.spliter}` as const;

  getRecordIdByName<STORAGE extends IStorages = IStorages, KEY extends keyof STORAGE = keyof STORAGE>(
    name: KEY
  ) {
    // @ts-ignore
    let output: `${typeof this.recordId}${KEY}` = `${this.prefix}:${name}`;
    return output;
  }

  // private getRecordNameById<STORAGE extends IStorages = IStorages, KEY extends keyof STORAGE = keyof STORAGE>(
  //   // @ts-ignore
  //   recordId: `${typeof this.recordId}${KEY}`
  // ) {
  //   let record = recordId.replace(this.recordId, "").trim() as KEY;
  //   return record;
  // }

  private isJson(value: IInputValue) {
    let output: boolean = false;
    if (typeof value == "string") {
      try {
        let parsed = JSON.parse(value);
        if (parsed instanceof Object) {
          output = true;
        }
      } catch (error) {
        output = false;
      }
    } else {
      output = false;
    }

    return output;
  }

  private make<STORAGE extends IStorages = IStorages, KEY extends keyof STORAGE = keyof STORAGE>(
    value: STORAGE[KEY]
  ) {
    let outputValue: string = "";
    let isJson = this.isJson(value as IInputValue);
    if (isJson) {
      outputValue = JSON.stringify(outputValue);
    } else {
      outputValue = _.toString(value);
    }
    return outputValue;
  }

  private read<
    STORAGE extends IStorages = IStorages,
    KEY extends keyof STORAGE = keyof STORAGE,
    // @ts-ignore
    RECORDID extends `${typeof this.prefix}${KEY}` = `${typeof this.prefix}${KEY}`
  >(recordId: RECORDID) {
    let value = localStorage.getItem(recordId);
    if (this.isJson(value as IInputValue)) {
      if (value !== null) {
        return JSON.parse(value) as STORAGE[KEY];
      } else {
        return undefined;
      }
    } else {
      if (value !== null) {
        return value;
      } else {
        return undefined;
      }
    }
  }

  create<STORAGE extends IStorages = IStorages, KEY extends keyof STORAGE = keyof STORAGE>(
    name: KEY,
    value: STORAGE[KEY]
  ) {
    let makedValue = this.make(value);
    let recordId = this.getRecordIdByName<STORAGE>(name);
    localStorage.setItem(recordId as string, makedValue);
  }

  use<STORAGE extends IStorages = IStorages, KEY extends keyof STORAGE = keyof STORAGE>(name: KEY) {
    let recordId = this.getRecordIdByName<STORAGE>(name);
    // @ts-ignore
    let value: STORAGE[KEY] | undefined = this.read(recordId);
    return value;
  }

  remove<STORAGE extends IStorages, KEY extends keyof STORAGE>(name: KEY) {
    let recordId = this.getRecordIdByName<STORAGE>(name);
    localStorage.removeItem(recordId as string);
  }
}
