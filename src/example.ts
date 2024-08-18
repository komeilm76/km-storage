import { z } from "zod";
import service from "./service";

let testSchema = z.object({
  secretCode: z.number().optional(),
  null: z.null(),
  nan: z.nan(),
  isMarid: z.boolean(),
  theme: z.union([z.literal("dark"), z.literal("light")]),
  user: z.object({
    name: z.string(),
    age: z.number(),
  }),
});

const example = () => {
  // instance service
  let storage = service.storage.install(testSchema, { prefix: "main" });

  // create example
  storage.create("secretCode", 123);
  storage.create("null", null);
  storage.create("nan", NaN);
  storage.create("isMarid", true);
  storage.create("theme", "dark");
  storage.create("user", { age: 12, name: "Komeil" });

  // use examples
  // ----
  // secretCode
  let secretCode = storage.use("secretCode");
  console.log("secretCode", secretCode);
  let secretCodeByNative = localStorage.getItem("main:secretCode");
  console.log("secretCodeByNative", secretCodeByNative);
  // null
  let _null = storage.use("null");
  console.log("null", _null);
  let nullByNative = localStorage.getItem("main:null");
  console.log("nullByNative", nullByNative);
  // nan
  let nan = storage.use("nan");
  console.log("nan", nan);
  let nanByNative = localStorage.getItem("main:nan");
  console.log("nanByNative", nanByNative);
  // isMarid
  let isMarid = storage.use("isMarid");
  console.log("isMarid", isMarid);
  let isMaridByNative = localStorage.getItem("main:isMarid");
  console.log("isMaridByNative", isMaridByNative);
  // theme
  let theme = storage.use("theme");
  console.log("theme", theme);
  let themeByNative = localStorage.getItem("main:theme");
  console.log("themeByNative", themeByNative);
  // user
  let user = storage.use("user");
  console.log("user", user);
  let userByNative = localStorage.getItem("main:user");
  console.log("userByNative", userByNative);
};

export default example;
