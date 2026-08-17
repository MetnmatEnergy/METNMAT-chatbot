/**
 * PM2 definition for the METNMAT customer-agent chatbot.
 *
 * This instance is SHARED. It also runs, from other repositories:
 *   3000  command-center dashboard   (internal staff tool)
 *   3100  metnmat.com website
 *   3200  Payload CMS
 *   3002  this chatbot
 *
 * Nothing here may touch the others. Every pm2 command in the release path
 * names this app or uses --only; `pm2 restart all` is never correct on this box.
 *
 * .cjs because PM2 requires CommonJS.
 */

module.exports = {
  apps: [
    {
      name: "metnmat-chatbot",

      // Runs under BUN, not Node, and that is deliberate rather than
      // convenient. The app's own Dockerfile is `FROM oven/bun:1.3` with
      // `CMD ["bun", "run", "index.ts"]`, and that is how it ran in production
      // on Cloud Run — so Bun is the tested configuration.
      //
      // A Node build was tried first and does not work: `bun build
      // --target=node` produces a 15 MB bundle that dies immediately with
      //   Cannot find module '@libsql/linux-x64-gnu'
      // because @mastra/libsql needs a NATIVE binding, and native .node
      // binaries cannot be inlined into a JS bundle. Shipping the platform
      // package alongside would work, but it would mean running the app in a
      // configuration it has never been run in.
      //
      // Bun installs per-user into ~/.bun. It does not touch system Node, the
      // package manager, or the other three apps, and uninstalling is `rm -rf
      // ~/.bun`.
      script: "/home/ec2-user/chat/bin/with-secrets.sh",
      interpreter: "/bin/bash",
      args: "bun run index.ts",
      cwd: "/home/ec2-user/chat/current",

      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "production",
        APP_NAME: "metnmat-chatbot",
        PORT: 3002,

        // Bun lives in the user's home, which a non-login pm2 shell does not
        // have on PATH.
        PATH: "/home/ec2-user/.bun/bin:/usr/local/bin:/usr/bin:/bin",

        // Its OWN secret prefix, not the shared metnmat/prod/*. That pool holds
        // a single MONGODB_URI and the two applications need DIFFERENT
        // databases — the CMS wants metnmat_cms, this wants metnmat. Sharing the
        // prefix would guarantee one of them points at the other's data, which
        // is the exact failure CLAUDE.md gotcha #1 documents.
        SECRET_PREFIX: "metnmat/chatbot/",

        // What the server cannot start without. Checked by with-secrets.sh
        // before bun is exec'd, so a missing value is one clear line instead of
        // a crash loop.
        REQUIRED_SECRETS: "MONGODB_URI OPENAI_API_KEY PINECONE_API_KEY AGENT_API_KEY JWT_SECRET",

        // Public origin, used to build the widget/iframe URLs the host site
        // loads. Wrong here means the widget requests assets from the wrong
        // origin and silently fails on the live site.
        PUBLIC_URL: "https://chat.metnmat.com",
        ALLOWED_ORIGINS: "https://www.metnmat.com,https://metnmat.com",
        WIDGET_FRAME_ANCESTORS: "https://www.metnmat.com https://metnmat.com",
      },

      // Mastra holds an agent runtime and RAG context; heavier than a plain
      // Express app. Sized against measured headroom — 2.6 GB free on the
      // t3.medium after the website and CMS — and deliberately left room for
      // the CMS to grow into.
      // No `node_args` key at all, deliberately. pm2 passes node_args to the
      // INTERPRETER, which here is bash — and bash rejects V8 flags. That
      // mistake crash-looped the website's first deploy on this same instance.
      // Anything of that kind belongs in env.NODE_OPTIONS, though Bun does not
      // take --max-old-space-size anyway.
      max_memory_restart: "700M",

      max_restarts: 10,
      min_uptime: "45s",
      restart_delay: 4000,
      autorestart: true,

      error_file: "/home/ec2-user/chat/logs/chatbot.error.log",
      out_file: "/home/ec2-user/chat/logs/chatbot.out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
