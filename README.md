# km-storage

km-storage is a Typescript library for use Local Storage.

## Installation

Use the package manager [npm](https://www.npmjs.com/package/km-storage) to install km-storage.

```bash
npm install km-storage
```

## Usage

```typescript
import storage from "km-storage";
import { z } from "zod";

let schema = z.object({
  gender: z.union([z.literal("F"), z.literal("M")]),
  isDark: z.boolean(),
  userInfo: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  }),
});
let localDB = storage.install(schema, { prefix: "db" });

// unions examples
// ----------------------------
localDB.create("gender", "M"); // validator trow error if entry is not equal with "M" or "F"
localDB.use("gender"); // return "M" // return string
localStorage.getItem("db:gender"); // return "M" // return string
// -----------------------------

// boolean examples
// ----------------------------
localDB.create("isDark", true);
localDB.use("isDark"); // return true ( type is boolean )
localStorage.getItem("db:isDark"); // return "true" ( type is string )
// -----------------------------

// object examples
// ----------------------------
localDB.create("userInfo", { name: "Komeil", age: 26, email: "komeilmohammadian1376.web@gmail.com" });
localDB.use("userInfo"); // return { ... } ( type is Object )
localStorage.getItem("db:isDark"); // return "{ ... }" ( type is string )
// -----------------------------
```

## dependensies

Required Dependensies is [ZOD](https://zod.dev/)

## License

[MIT](https://choosealicense.com/licenses/mit/)
