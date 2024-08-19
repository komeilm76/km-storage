import type { Config } from "release-it";

export default {
  git: {
    commit: true,
    tag: true,
    push: true,
    commitMessage: "chore: release ( v${version} )",
  },
  github: {
    release: true,
  },
  npm: {
    publish: true,
  },
} satisfies Config;
